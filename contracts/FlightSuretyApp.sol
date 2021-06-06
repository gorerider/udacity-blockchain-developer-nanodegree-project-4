pragma solidity ^0.4.25;

// It's important to avoid vulnerabilities due to numeric overflow bugs
// OpenZeppelin's SafeMath library, when used correctly, protects agains such bugs
// More info: https://www.nccgroup.trust/us/about-us/newsroom-and-events/blog/2018/november/smart-contract-insecurity-bad-arithmetic/

import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";

/************************************************** */
/* FlightSurety Smart Contract                      */
/************************************************** */
contract FlightSuretyApp {
    using SafeMath for uint256; // Allow SafeMath functions to be called for all uint256 types (similar to "prototype" in Javascript)

    FlightSuretyData flightSuretyData;

    // Minimum funds balance which allows airlines to participate
    uint256 public constant MIN_FUNDS = 10 ether;
    uint256 public constant MAX_INSURANCE_PER_POLICY = 1 ether;

    /********************************************************************************************/
    /*                                       DATA VARIABLES                                     */
    /********************************************************************************************/

    // Flight status codees
    uint8 private constant STATUS_CODE_UNKNOWN = 0;
    uint8 private constant STATUS_CODE_ON_TIME = 10;
    uint8 private constant STATUS_CODE_LATE_AIRLINE = 20;
    uint8 private constant STATUS_CODE_LATE_WEATHER = 30;
    uint8 private constant STATUS_CODE_LATE_TECHNICAL = 40;
    uint8 private constant STATUS_CODE_LATE_OTHER = 50;

    address private contractOwner;          // Account used to deploy contract

    struct Flight {
        bool isRegistered;
        uint8 statusCode;
        uint256 updatedTimestamp;
        address airline;
    }
    mapping(bytes32 => Flight) private flights;

    struct Queue {
        bool isCreated;
        address[] votes;
    }
    mapping (address => Queue) private airlineRegistrationQueue;

 
    /********************************************************************************************/
    /*                                       FUNCTION MODIFIERS                                 */
    /********************************************************************************************/

    // Modifiers help avoid duplication of code. They are typically used to validate something
    // before a function is allowed to be executed.

    /**
    * @dev Modifier that requires the "operational" boolean variable to be "true"
    *      This is used on all state changing functions to pause the contract in 
    *      the event there is an issue that needs to be fixed
    */
    modifier requireIsOperational() 
    {
         // Modify to call data contract's status
        require(isOperational(), "Contract is currently not operational");
        _;  // All modifiers require an "_" which indicates where the function body will be added
    }

    /**
    * @dev Modifier that requires the "ContractOwner" account to be the function caller
    */
    modifier requireContractOwner()
    {
        require(msg.sender == contractOwner, "Caller is not contract owner");
        _;
    }

    modifier requireActiveAirline()
    {
        require(flightSuretyData.isAirlineActive(msg.sender, MIN_FUNDS), "Airline is not active");
        _;
    }

    /********************************************************************************************/
    /*                                       CONSTRUCTOR                                        */
    /********************************************************************************************/

    /**
    * @dev Contract constructor
    *
    */
    constructor(address dataContract) public
    {
        contractOwner = msg.sender;
        flightSuretyData = FlightSuretyData(dataContract);
    }

    /********************************************************************************************/
    /*                                       UTILITY FUNCTIONS                                  */
    /********************************************************************************************/

    function isOperational() public view returns(bool)
    {
        return flightSuretyData.isOperational();
    }

    /********************************************************************************************/
    /*                                       EVENTS                                             */
    /********************************************************************************************/
    event FlightInsured(address passenger, string flight, uint256 value);
    event InsureePayoutInfo(uint256);

    /********************************************************************************************/
    /*                                     SMART CONTRACT FUNCTIONS                             */
    /********************************************************************************************/

  
   /**
    * @dev Add an airline to the registration queue
    *
    */   
    function registerAirline(address airline) external requireActiveAirline returns(bool success, uint256 votes)
    {
        require(!flightSuretyData.isAirlineRegistered(airline), "(App) Airline already registered");

        bool _success;
        uint256 _votes;

        if (airlineRegistrationQueue[airline].isCreated) {
            // New airline needs the majority to be registered

            // Check for duplicate votes
            bool isDuplicate = false;
            for (uint i = 0; i < airlineRegistrationQueue[airline].votes.length; i++) {
                if (airlineRegistrationQueue[airline].votes[i] == msg.sender) {
                    isDuplicate = true;
                    break;
                }
            }
            require(!isDuplicate, "Airline already voted");

            // Add vote
            airlineRegistrationQueue[airline].votes.push(msg.sender);

            // Check multi-consensus / majority is fulfilled
            uint256 numberVotes = airlineRegistrationQueue[airline].votes.length;
            if (numberVotes >= flightSuretyData.getAirlineCount().sub(numberVotes)) {
                // Register airline in data contract
                flightSuretyData.registerAirline(airline);

                // Clear queue
                delete airlineRegistrationQueue[airline];

                _success = true;
            }

            _votes = numberVotes;
        } else {
            // Registration process starts
            if (flightSuretyData.getAirlineCount() >= 4) {
                airlineRegistrationQueue[airline] = Queue({ isCreated: true, votes: new address[](0) });
                airlineRegistrationQueue[airline].votes.push(msg.sender);

                _votes = airlineRegistrationQueue[airline].votes.length;
            } else {
                // Register airline in data contract
                flightSuretyData.registerAirline(airline);

                _success = true;
            }
        }

        return (_success, _votes);
    }


   /**
    * @dev Register a future flight for insuring.
    *
    */  
    function registerFlight(address airline, string flight, uint timestamp) external
    requireIsOperational
    requireActiveAirline
    {
        bytes32 flightKey = getFlightKey(airline, flight, timestamp);
        require(!flights[flightKey].isRegistered, "Flight is already registered");

        flights[flightKey] = Flight({
            isRegistered: true,
            statusCode: STATUS_CODE_UNKNOWN,
            updatedTimestamp: timestamp,
            airline: airline
        });
    }

    /**
     * @dev Check if given flight is registered
     */
    function isFlightRegistered(address airline, string flight, uint timestamp) public view returns(bool)
    {
        bytes32 flightKey = getFlightKey(airline, flight, timestamp);
        return flights[flightKey].isRegistered;
    }

   /**
    * @dev Called after oracle has updated flight status
    *
    */  
    function processFlightStatus (address airline, string memory flight, uint256 timestamp, uint8 statusCode)
    internal
    requireIsOperational
    {
        bytes32 flightKey = getFlightKey(airline, flight, timestamp);
        require(flights[flightKey].isRegistered, "Flight is not registered");
        // require(flights[flightKey].statusCode == STATUS_CODE_UNKNOWN, "Got minimum responses already. Ignoring");

        flights[flightKey].statusCode = statusCode;

        if(statusCode == STATUS_CODE_LATE_AIRLINE) {
            flightSuretyData.creditInsurees(airline, flight, timestamp);
        }
    }


    // Generate a request for oracles to fetch flight information
    function fetchFlightStatus
                        (
                            address airline,
                            string flight,
                            uint256 timestamp                            
                        )
                        external
    {
        uint8 index = getRandomIndex(msg.sender);

        // Generate a unique key for storing the request
        bytes32 key = keccak256(abi.encodePacked(index, airline, flight, timestamp));
        oracleResponses[key] = ResponseInfo({
                                                requester: msg.sender,
                                                isOpen: true
                                            });

        emit OracleRequest(index, airline, flight, timestamp);
    }

    /**
    * @dev Passenger buys insurance
    */
    function buyInsurance(address airline, string flight, uint256 timestamp) external payable
    requireIsOperational
    {
        require(isFlightRegistered(airline, flight, timestamp), "Can't buy insurance for non existing flight");
        require(msg.value > 0 && msg.value <= MAX_INSURANCE_PER_POLICY, "Accepted insurance value: 0 < VALUE <= 1 ETH");
        // https://ethereum.stackexchange.com/questions/9705/how-can-you-call-a-payable-function-in-another-contract-with-arguments-and-send
        flightSuretyData.buy.value(msg.value)(airline, flight, timestamp, msg.sender);

        emit FlightInsured(msg.sender, flight, msg.value);
    }

    /**
    * @dev Check if passenger has insurance for given flight
    */
    function passengerHasInsurance(address airline, string flight, uint256 timestamp) public view returns (bool)
    {
        bytes32 flightKey = getFlightKey(airline, flight, timestamp);
        return flightSuretyData.passengerHasInsurance(msg.sender, flightKey);
    }

    /**
     * @dev Get available credit for insured flight if any credited yet
     */
    function getCreditValue(address airline, string flight, uint256 timestamp) public view returns(uint256)
    {
        return flightSuretyData.getCreditValue(msg.sender, airline, flight, timestamp);
    }

    /**
    * @dev Let passenger withdraw credit
    */
    function withdraw() external requireIsOperational
    {
        uint256 payoutAmount = flightSuretyData.pay(msg.sender);
        emit InsureePayoutInfo(payoutAmount);
    }


// region ORACLE MANAGEMENT

    // Incremented to add pseudo-randomness at various points
    uint8 private nonce = 0;

    // Fee to be paid when registering oracle
    uint256 public constant REGISTRATION_FEE = 1 ether;

    // Number of oracles that must respond for valid status
    uint256 private constant MIN_RESPONSES = 3;


    struct Oracle {
        bool isRegistered;
        uint8[3] indexes;        
    }

    // Track all registered oracles
    mapping(address => Oracle) private oracles;

    // Model for responses from oracles
    struct ResponseInfo {
        address requester;                              // Account that requested status
        bool isOpen;                                    // If open, oracle responses are accepted
        mapping(uint8 => address[]) responses;          // Mapping key is the status code reported
                                                        // This lets us group responses and identify
                                                        // the response that majority of the oracles
    }

    // Track all oracle responses
    // Key = hash(index, flight, timestamp)
    mapping(bytes32 => ResponseInfo) private oracleResponses;

    // Event fired each time an oracle submits a response
    event FlightStatusInfo(address airline, string flight, uint256 timestamp, uint8 status);

    event OracleReport(address airline, string flight, uint256 timestamp, uint8 status);

    // Event fired when flight status request is submitted
    // Oracles track this and if they have a matching index
    // they fetch data and submit a response
    event OracleRequest(uint8 index, address airline, string flight, uint256 timestamp);


    // Register an oracle with the contract
    function registerOracle
                            (
                            )
                            external
                            payable
    {
        // Require registration fee
        require(msg.value >= REGISTRATION_FEE, "Registration fee is required");

        uint8[3] memory indexes = generateIndexes(msg.sender);

        oracles[msg.sender] = Oracle({
                                        isRegistered: true,
                                        indexes: indexes
                                    });
    }

    function getMyIndexes
                            (
                            )
                            view
                            external
                            returns(uint8[3])
    {
        require(oracles[msg.sender].isRegistered, "Not registered as an oracle");

        return oracles[msg.sender].indexes;
    }




    // Called by oracle when a response is available to an outstanding request
    // For the response to be accepted, there must be a pending request that is open
    // and matches one of the three Indexes randomly assigned to the oracle at the
    // time of registration (i.e. uninvited oracles are not welcome)
    function submitOracleResponse
                        (
                            uint8 index,
                            address airline,
                            string flight,
                            uint256 timestamp,
                            uint8 statusCode
                        )
                        external
    {
        require((oracles[msg.sender].indexes[0] == index) || (oracles[msg.sender].indexes[1] == index) || (oracles[msg.sender].indexes[2] == index), "Index does not match oracle request");


        bytes32 key = keccak256(abi.encodePacked(index, airline, flight, timestamp)); 
        require(oracleResponses[key].isOpen, "Flight or timestamp do not match oracle request");

        oracleResponses[key].responses[statusCode].push(msg.sender);

        // Information isn't considered verified until at least MIN_RESPONSES
        // oracles respond with the *** same *** information
        emit OracleReport(airline, flight, timestamp, statusCode);
        if (oracleResponses[key].responses[statusCode].length >= MIN_RESPONSES) {

            emit FlightStatusInfo(airline, flight, timestamp, statusCode);

            // Handle flight status as appropriate
            processFlightStatus(airline, flight, timestamp, statusCode);
        }
    }


    function getFlightKey
                        (
                            address airline,
                            string flight,
                            uint256 timestamp
                        )
                        pure
                        internal
                        returns(bytes32) 
    {
        return keccak256(abi.encodePacked(airline, flight, timestamp));
    }

    // Returns array of three non-duplicating integers from 0-9
    function generateIndexes
                            (                       
                                address account         
                            )
                            internal
                            returns(uint8[3])
    {
        uint8[3] memory indexes;
        indexes[0] = getRandomIndex(account);
        
        indexes[1] = indexes[0];
        while(indexes[1] == indexes[0]) {
            indexes[1] = getRandomIndex(account);
        }

        indexes[2] = indexes[1];
        while((indexes[2] == indexes[0]) || (indexes[2] == indexes[1])) {
            indexes[2] = getRandomIndex(account);
        }

        return indexes;
    }

    // Returns array of three non-duplicating integers from 0-9
    function getRandomIndex
                            (
                                address account
                            )
                            internal
                            returns (uint8)
    {
        uint8 maxValue = 10;

        // Pseudo random number...the incrementing nonce adds variation
        uint8 random = uint8(uint256(keccak256(abi.encodePacked(blockhash(block.number - nonce++), account))) % maxValue);

        if (nonce > 250) {
            nonce = 0;  // Can only fetch blockhashes for last 256 blocks so we adapt
        }

        return random;
    }

// endregion

}

contract FlightSuretyData {
    function isOperational() public view returns(bool);
    function isAirlineRegistered(address airline) public view returns (bool);
    function isAirlineActive(address airline, uint256 minFunds) public view returns (bool);
    function getAirlineCount() public view returns (uint256);
    function registerAirline(address newAirline) external;
    function creditInsurees (address airline, string flight, uint256 timestamp);
    function buy (address airline, string flight, uint256 timestamp, address passenger) external payable;
    function passengerHasInsurance(address passenger, bytes32 flightKey) public view returns (bool);
    function getCreditValue(address passenger, address airline, string flight, uint256 timestamp) public view returns(uint256);
    function pay (address passenger) external returns (uint256);
}

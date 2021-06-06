pragma solidity ^0.4.25;

import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";

contract FlightSuretyData {
    using SafeMath for uint256;

    struct InsurancePolicy {
        bool created;   // Policy is created
        uint256 value;  // Insurance value
        bool credited;  // Policy credit has been calculated or not
        uint256 credit; // Credited value that passenger can withdraw
    }

    // Stores passenger insurances
    mapping(bytes32 => mapping(address => InsurancePolicy)) private flightInsurances;
    mapping(bytes32 => address[]) private flightPassengers;
    mapping(address => bytes32[]) private passengerToFlights;

    // Airline
    struct Airline {
        bool created;       // Determines if airline was created
        uint256 funds;      // Funds balance
    }

    // Stores airlines
    mapping (address => Airline) private airlines;
    // Store total number of registered airlines. Used for multi-party consensus
    uint256 private airlineCount = 0;

    /********************************************************************************************/
    /*                                       DATA VARIABLES                                     */
    /********************************************************************************************/

    address private contractOwner;                                      // Account used to deploy contract
    mapping(address => uint256) private authorizedCallers;              // Authorized app contracts
    bool private operational = true;                                    // Blocks all state changes throughout the contract if false

    /********************************************************************************************/
    /*                                       EVENT DEFINITIONS                                  */
    /********************************************************************************************/


    /**
    * @dev Constructor
    *      The deploying account becomes contractOwner
    */
    constructor (address firstAirline) public
    {
        contractOwner = msg.sender;
        _registerAirline(firstAirline);
    }

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
        require(operational, "Contract is currently not operational");
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

    modifier requireAuthorizedCaller()
    {
        require(authorizedCallers[msg.sender] == 1, "Caller is not authorized to interact with this contract");
        _;
    }

    modifier requireAirlineCaller()
    {
        require(isAirlineRegistered(msg.sender), "Caller is not a registered airline");
        _;
    }

    /********************************************************************************************/
    /*                                       UTILITY FUNCTIONS                                  */
    /********************************************************************************************/

    /**
    * @dev Get operating status of contract
    *
    * @return A bool that is the current operating status
    */
    function isOperational() public view returns(bool)
    {
        return operational;
    }

    /**
    * @dev Sets contract operations on/off
    *
    * When operational mode is disabled, all write transactions except for this one will fail
    */
    function setOperatingStatus(bool mode) external requireContractOwner {
        require(operational != mode, "Modes needs to be different");
        operational = mode;
    }

    function authorizeCaller(address callerAddress) external requireContractOwner
    {
        authorizedCallers[callerAddress] = 1;
    }

    function deauthorizeCaller(address callerAddress) external requireContractOwner
    {
        delete authorizedCallers[callerAddress];
    }

    function getAirlineCount() public view returns (uint256)
    {
        return airlineCount;
    }

    // Added airline is registered, but not yet active / not funded
    function isAirlineRegistered(address airline) public view returns (bool)
    {
        return airlines[airline].created;
    }

    // Funded airlines are active
    function isAirlineActive(address airline, uint256 minFunds) public view returns (bool)
    {
        return airlines[airline].funds >= minFunds;
    }

    // Check if passenger has purchased insurance for particular flight
    function passengerHasInsurance(address passenger, bytes32 flightKey) public view returns (bool)
    {
        return flightInsurances[flightKey][passenger].created;
    }

    /********************************************************************************************/
    /*                                     SMART CONTRACT FUNCTIONS                             */
    /********************************************************************************************/

    /**
     * @dev Add an airline to the registration queue
     *      Can only be called from FlightSuretyApp contract
     *
     */
    function registerAirline(address newAirline) external requireAuthorizedCaller requireIsOperational
    {
        _registerAirline(newAirline);
    }

    function _registerAirline(address newAirline) private
    {
        require(!isAirlineRegistered(newAirline), "(Data) Airline already registered");

        airlines[newAirline] = Airline({ created: true, funds: 0 });
        airlineCount = airlineCount.add(1);
    }

    /**
     * @dev Buy insurance for a flight
     *
     */
    function buy (address airline, string flight, uint256 timestamp, address passenger)
    external
    payable
    requireIsOperational
    requireAuthorizedCaller
    {
        bytes32 flightKey = getFlightKey(airline, flight, timestamp);
        require(!flightInsurances[flightKey][passenger].created, "Insurance already exists");

        flightInsurances[flightKey][passenger] = InsurancePolicy({
            created: true,
            value: msg.value,
            credited: false,
            credit: 0
        });

        flightPassengers[flightKey].push(passenger);
        passengerToFlights[passenger].push(flightKey);
    }

    /**
     *  @dev Credits payouts to insurees
    */
    function creditInsurees (address airline, string flight, uint256 timestamp)
    external
    requireIsOperational
    requireAuthorizedCaller
    {
        bytes32 flightKey = getFlightKey(airline, flight, timestamp);
        address[] storage passengers = flightPassengers[flightKey];

        for(uint256 i = 0; i < passengers.length; i++) {
            address passenger = passengers[i];
            InsurancePolicy storage policy = flightInsurances[flightKey][passenger];
            bool credited = policy.credited;
            uint256 value = policy.value;

            if (!credited) {
                flightInsurances[flightKey][passenger].credit = value.mul(15).div(10);
                flightInsurances[flightKey][passenger].credited = true;
            }
        }
    }

    /**
     * @dev Get credit for insuree for particular flight
     */
    function getCreditValue(address passenger, address airline, string flight, uint256 timestamp) public view returns(uint256)
    {
        bytes32 flightKey = getFlightKey(airline, flight, timestamp);

        InsurancePolicy storage insurance = flightInsurances[flightKey][passenger];
        if (insurance.created) {
            return insurance.credit;
        }

        return 0;
    }


    /**
     *  @dev Transfers eligible payout funds to insuree
     *
    */
    function pay (address passenger) external requireIsOperational requireAuthorizedCaller returns (uint256)
    {
        require(passengerToFlights[passenger].length > 0, "Passenger has no insurances");

        bytes32[] storage flightKeys = passengerToFlights[passenger];
        uint256 payoutAmount = 0;

        for (uint256 i = 0; i < flightKeys.length; i++) {
            bytes32 flightKey = flightKeys[i];
            uint256 credit = flightInsurances[flightKey][passenger].credit;
            uint256 value = flightInsurances[flightKey][passenger].value;

            if (credit > 0) {
                // Passengers will get value * 1.5
                payoutAmount = payoutAmount.add(credit);
                // Delete insurance
                delete flightInsurances[flightKey][passenger];
            }
        }

        passenger.transfer(payoutAmount);

        return payoutAmount;
    }

    /**
     * @dev Initial funding for the insurance. Unless there are too many delayed flights
     *      resulting in insurance payouts, the contract should be self-sustaining.
     *
     *      Funds only accepted from registered airlines.
     *
     */
    function fund () public requireAirlineCaller requireIsOperational payable
    {
        require(msg.value > 0, "Value must be greater than 0");

        airlines[msg.sender].funds = airlines[msg.sender].funds.add(msg.value);
    }

    function getFlightKey
    (
        address airline,
        string memory flight,
        uint256 timestamp
    )
    pure
    internal
    returns(bytes32)
    {
        return keccak256(abi.encodePacked(airline, flight, timestamp));
    }

    /**
    * @dev Fallback function for funding smart contract.
    *
    */
    function() external payable
    {
        fund();
    }


}


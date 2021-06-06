import FlightSuretyApp from '../../build/contracts/FlightSuretyApp.json';
import Config from './config.json';
import Web3 from 'web3';

export default class Contract {
    constructor(network, callback) {

        let config = Config[network];

        if (window.ethereum) {
            // use MetaMask's provider
            this.web3 = new Web3(window.ethereum);
            (async () => {
                await window.ethereum.enable(); // get permission to access accounts
            })();
        } else {
            // fallback - use your fallback strategy (local node / hosted node + in-dapp id mgmt / fail)
            this.web3 = new Web3(new Web3.providers.HttpProvider(config.url));
        }

        this.flightSuretyApp = new this.web3.eth.Contract(FlightSuretyApp.abi, config.appAddress);
        this.initialize(callback);
        this.owner = null;
        this.airlines = [];
        this.passengers = [];
    }

    initialize(callback) {
        this.web3.eth.getAccounts((error, accts) => {
            this.owner = accts[0];

            let counter = 1;
            
            while(this.airlines.length < 5) {
                this.airlines.push(accts[counter++]);
            }

            while(this.passengers.length < 5) {
                this.passengers.push(accts[counter++]);
            }

            callback();
        });
    }

    isOperational(callback) {
       let self = this;
       self.flightSuretyApp.methods
            .isOperational()
            .call({ from: self.owner }, callback);
    }

    buyInsurance(options, callback) {
        let self = this;
        let value = self.web3.utils.toWei(options.value, "ether");

        console.log('Purchasing Insurance with Options:', options);

        self.flightSuretyApp.methods
            .buyInsurance(options.airline, options.flight, options.timestamp)
            .send({ from: self.owner, value: value}, callback);
    }

    getCreditValue(options, callback) {
        let self = this;

        console.log('Checking Credit Value: ', options);

        self.flightSuretyApp.methods
            .getCreditValue(options.airline, options.flight, options.timestamp)
            .call({ from: self.owner }, (error, result) => {
                callback(error, self.web3.utils.fromWei(result, 'ether'));
            });
    }

    withdraw(callback) {
        let self = this;

        console.log('Withdrawing funds');

        self.flightSuretyApp.methods
            .withdraw()
            .send({ from: self.owner }, callback);
    }

    fetchFlightStatus(options, callback) {
        let self = this;

        self.flightSuretyApp.methods
            .fetchFlightStatus(options.airline, options.flight, options.timestamp)
            .send({ from: self.owner}, (error, result) => {
                callback(error, options);
            });
    }
}
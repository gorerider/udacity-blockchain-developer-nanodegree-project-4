import FlightSuretyApp from '../../build/contracts/FlightSuretyApp.json';
import Config from './config.json';
import Web3 from 'web3';
import express from 'express';

// status codes
const STATUS_CODE_UNKNOWN = 0;
const STATUS_CODE_ON_TIME = 10;
const STATUS_CODE_LATE_AIRLINE = 20;
const STATUS_CODE_LATE_WEATHER = 30;
const STATUS_CODE_LATE_TECHNICAL = 40;
const STATUS_CODE_LATE_OTHER = 50;

const ALL_STATUS_CODES = [
    STATUS_CODE_UNKNOWN,
    STATUS_CODE_ON_TIME,
    STATUS_CODE_LATE_AIRLINE,
    STATUS_CODE_LATE_WEATHER,
    STATUS_CODE_LATE_TECHNICAL,
    STATUS_CODE_LATE_OTHER,
];

const getRandomStatusCode = () => {
    return ALL_STATUS_CODES[Math.floor(Math.random() * ALL_STATUS_CODES.length)];
}

// oracles
const maxOraclesCounts = 30;
let oracles = {};

let config = Config['localhost'];
let web3 = new Web3(new Web3.providers.WebsocketProvider(config.url.replace('http', 'ws')));
web3.eth.defaultAccount = web3.eth.accounts[0];
let flightSuretyApp = new web3.eth.Contract(FlightSuretyApp.abi, config.appAddress);

web3.eth.getAccounts().then(accounts => {
    flightSuretyApp.methods.REGISTRATION_FEE().call()
        .then(fee => {
            const feeEth = web3.utils.fromWei(fee, 'ether');
            console.log('Oracle Registration Fee: ' + feeEth + ' ETH');

            for (let i = 1; i <= maxOraclesCounts; i++) {
                let oracleAddress = accounts[i];

                flightSuretyApp.methods.registerOracle()
                    .send({ from: oracleAddress, value: fee, gas: 1000000 })
                    .then(receipt => {
                        flightSuretyApp.methods
                            .getMyIndexes()
                            .call({ from: oracleAddress })
                            .then(indices => {
                                oracles[oracleAddress] = indices;
                                console.log(
                                    'Oracle registered: ' + oracleAddress + ', indices:' + indices
                                );
                            })
                    })
                    .catch(error => {
                        console.log('' + error);
                    })
            }
        });
})

flightSuretyApp.events.OracleRequest({
    fromBlock: 0
  }, function (error, event) {
    if (error) {
        console.log(error)
    } else {
        const { index, airline, flight, timestamp } = event.returnValues;
        console.log('App requesting Oracle data with: ', index, airline, flight, timestamp);

        // let randomStatusCode = getRandomStatusCode();

        // (Testing) Flight is on time: passengers won't be credited
        // let randomStatusCode = STATUS_CODE_ON_TIME;

        // (Testing) Flight is late due to airline: passengers will be credited
        let randomStatusCode = STATUS_CODE_LATE_AIRLINE;

        for (let address in oracles) {
            let indexes = oracles[address];
            if (indexes.includes(index)) {
                flightSuretyApp.methods
                    .submitOracleResponse(
                        index,
                        airline,
                        flight,
                        timestamp,
                        randomStatusCode
                    )
                    .send({ from: address, gas: 1000000 })
                    .then(receipt => {
                        console.log(
                            'Oracle sent Status Code: ' + randomStatusCode + ' for ' + flight + ' and index:' + index
                        );
                    })
                    .catch(error => {
                        console.log('Error while sending Oracle response  for ' + flight + ' Error:' + error);
                    })
            }
        }
    }
});

const app = express();
app.get('/api', (req, res) => {
    res.send({
      message: 'An API for use with your Dapp!'
    })
})

export default app;

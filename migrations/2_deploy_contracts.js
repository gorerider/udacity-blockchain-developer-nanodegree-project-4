const FlightSuretyApp = artifacts.require("FlightSuretyApp");
const FlightSuretyData = artifacts.require("FlightSuretyData");
const fs = require('fs');

module.exports = function(deployer) {

    let firstAirline = '0xf17f52151EbEF6C7334FAD080c5704D77216b732';
    deployer.deploy(FlightSuretyData, firstAirline)
    .then(() => {
        return deployer.deploy(FlightSuretyApp, FlightSuretyData.address)
            .then(() => {
                let config = {
                    localhost: {
                        url: 'http://localhost:8545',
                        dataAddress: FlightSuretyData.address,
                        appAddress: FlightSuretyApp.address
                    }
                }
                fs.writeFileSync(__dirname + '/../src/dapp/config.json',JSON.stringify(config, null, '\t'), 'utf-8');
                fs.writeFileSync(__dirname + '/../src/server/config.json',JSON.stringify(config, null, '\t'), 'utf-8');
            })
            .then(async () => {
                const dataContract = await FlightSuretyData.deployed();
                await dataContract.authorizeCaller(FlightSuretyApp.address);
            })
            .then(async () => {
                const dataContract = await FlightSuretyData.deployed();
                const appContract = await FlightSuretyApp.deployed();

                // register three flights for DAPP Client
                let flightOne = 'LH0001';
                let flightTwo = 'LH0002';
                let flightThree = 'LH0003';
                let timestamp = Math.floor(Date.now() / 1000);

                // firstAirline needs to fund first
                await dataContract.fund({ from: firstAirline, value: web3.utils.toWei("10", "ether") });

                await appContract.registerFlight(firstAirline, flightOne, timestamp, { from: firstAirline });
                await appContract.registerFlight(firstAirline, flightTwo, timestamp, { from: firstAirline });
                await appContract.registerFlight(firstAirline, flightThree, timestamp, { from: firstAirline });

                let flights = [
                    {
                        airline: firstAirline,
                        flight: flightOne,
                        timestamp: timestamp,
                    },
                    {
                        airline: firstAirline,
                        flight: flightTwo,
                        timestamp: timestamp,
                    },
                    {
                        airline: firstAirline,
                        flight: flightThree,
                        timestamp: timestamp,
                    },
                ];

                fs.writeFileSync(__dirname + '/../src/dapp/flights.json',JSON.stringify(flights, null, '\t'), 'utf-8');
            });
    });
}
const truffleAssert = require('truffle-assertions')

var Test = require('../config/testConfig.js');
var BigNumber = require('bignumber.js');

contract('Flight Surety Tests', async (accounts) => {

  var config;
  beforeEach('setup contract', async () => {
    config = await Test.Config(accounts);
    await config.flightSuretyData.authorizeCaller(config.flightSuretyApp.address);
  });

  /****************************************************************************************/
  /* Operations and Settings                                                              */
  /****************************************************************************************/

  it(`(multiparty) has correct initial isOperational() value`, async function () {

    // Get operating status
    let status = await config.flightSuretyData.isOperational.call();
    assert.equal(status, true, "Incorrect initial operating status value");

  });

  it(`(multiparty) can block access to setOperatingStatus() for non-Contract Owner account`, async function () {

      // Ensure that access is denied for non-Contract Owner account
      let accessDenied = false;
      try 
      {
          await config.flightSuretyData.setOperatingStatus(false, { from: config.testAddresses[2] });
      }
      catch(e) {
          accessDenied = true;
      }
      assert.equal(accessDenied, true, "Access not restricted to Contract Owner");
            
  });

  it(`(multiparty) can allow access to setOperatingStatus() for Contract Owner account`, async function () {

      // Ensure that access is allowed for Contract Owner account
      let accessDenied = false;
      try 
      {
          await config.flightSuretyData.setOperatingStatus(false);
      }
      catch(e) {
          accessDenied = true;
      }
      assert.equal(accessDenied, false, "Access not restricted to Contract Owner");
      
  });

  it(`(multiparty) can block access to functions using requireIsOperational when operating status is false`, async function () {

      await config.flightSuretyData.setOperatingStatus(false);

      let reverted = false;
      try 
      {
          await config.flightSurety.setTestingMode(true);
      }
      catch(e) {
          reverted = true;
      }
      assert.equal(reverted, true, "Access not blocked for requireIsOperational");      

      // Set it back for other tests to work
      await config.flightSuretyData.setOperatingStatus(true);

  });

  it('(airline) cannot register an Airline using registerAirline() if it is not funded', async () => {
    
    // ARRANGE
    let newAirline = config.secondAirline;

    // ACT
    try {
      await config.flightSuretyApp.registerAirline(newAirline, {from: config.firstAirline});
    }
    catch(e) {

    }
    let result = await config.flightSuretyData.isAirlineRegistered.call(newAirline);

    // ASSERT
    assert.equal(result, false, "Airline should not be able to register another airline if it hasn't provided funding");
  });
 
  it('(airline) funded airline can participate in contract', async () => {
      let firstAirline = config.firstAirline;

      const minFunds = await config.flightSuretyApp.MIN_FUNDS.call();

      let airlineIsActiveBefore = await config.flightSuretyData.isAirlineActive.call(firstAirline, minFunds);

      // send 10 ETH to contract for funding
      await web3.eth.sendTransaction({
          from: firstAirline,
          to: config.flightSuretyData.address,
          value: config.weiMultiple * 10
      });

      let airlineIsActiveAfter = await config.flightSuretyData.isAirlineActive.call(firstAirline, minFunds);

      assert.equal(airlineIsActiveBefore, false, "Airline is active without funds");
      assert.equal(airlineIsActiveAfter, true, "Airline is NOT active with funds");
  });

  it('(airline) multi consensus works + fund airlines', async () => {
      // 10 ETH
      let minFundAmount = config.minFundAmount;

      // AIRLINES
      let firstAirline = config.firstAirline;
      let secondAirline = config.secondAirline;
      let thirdAirline = config.thirdAirline;
      let fourthAirline = config.fourthAirline;
      let fifthAirline = config.sixthAirline;

      // FUND firstAirline
      await web3.eth.sendTransaction({
          from: firstAirline,
          to: config.flightSuretyData.address,
          value: minFundAmount,
      });

      // REGISTER next three airlines directly
      await config.flightSuretyApp.registerAirline(secondAirline, {from: firstAirline});
      await config.flightSuretyApp.registerAirline(thirdAirline, {from: firstAirline});
      await config.flightSuretyApp.registerAirline(fourthAirline, {from: firstAirline});

      // CHECK 'registered' status for newly registered airlines
      let isSecondAirlineRegistered = await config.flightSuretyData.isAirlineRegistered.call(secondAirline);
      let isThirdAirlineRegistered = await config.flightSuretyData.isAirlineRegistered.call(thirdAirline);
      let isFourthAirlineRegistered = await config.flightSuretyData.isAirlineRegistered.call(fourthAirline);

      assert.equal(isSecondAirlineRegistered, true, "Second airline is not registered");
      assert.equal(isThirdAirlineRegistered, true, "Third airline is not registered");
      assert.equal(isFourthAirlineRegistered, true, "Fourth airline is not registered");

      // FUND three airlines
      await web3.eth.sendTransaction({from: secondAirline, to: config.flightSuretyData.address, value: minFundAmount});
      await web3.eth.sendTransaction({from: thirdAirline, to: config.flightSuretyData.address, value: minFundAmount});
      await web3.eth.sendTransaction({from: fourthAirline, to: config.flightSuretyData.address, value: minFundAmount});

      // CHECK 'active' status for newly registered airlines
      let isSecondAirlineActive = await config.flightSuretyData.isAirlineActive.call(secondAirline, minFundAmount);
      let isThirdAirlineActive = await config.flightSuretyData.isAirlineActive.call(thirdAirline, minFundAmount);
      let isFourthAirlineActive = await config.flightSuretyData.isAirlineActive.call(fourthAirline, minFundAmount);

      assert.equal(isSecondAirlineActive, true, "Second airline is not active");
      assert.equal(isThirdAirlineActive, true, "Third airline is not active");
      assert.equal(isFourthAirlineActive, true, "Fourth airline is not active");

      // REGISTER fifth airline
      await config.flightSuretyApp.registerAirline(fifthAirline, {from: fourthAirline})
      await config.flightSuretyApp.registerAirline(fifthAirline, {from: thirdAirline});

      // Following registration calls fail because fifthAirline already reached consensus and thus is registered
      truffleAssert.reverts(
          config.flightSuretyApp.registerAirline(fifthAirline, {from: secondAirline}),
          "(App) Airline already registered"
      );

      truffleAssert.reverts(
          config.flightSuretyApp.registerAirline(fifthAirline, {from: firstAirline}),
          "(App) Airline already registered"
      );

      // CHECK 'registered' status for fifth registered airlines
      assert.isTrue(
          await config.flightSuretyData.isAirlineRegistered.call(fifthAirline),
          "Fifth airline is not registered"
      );

      // CHECK 'active' status for fifth registered airlines
      assert.isFalse(
          await config.flightSuretyData.isAirlineActive.call(fifthAirline, minFundAmount),
          "Fifth airline is active"
      );
  });

  it('(airline) register new flight', async () => {
      // 10 ETH
      let minFundAmount = config.minFundAmount;

      // AIRLINES
      let firstAirline = config.firstAirline;

      // FUND firstAirline
      await web3.eth.sendTransaction({
          from: firstAirline,
          to: config.flightSuretyData.address,
          value: minFundAmount,
      });

      let flight = 'LF0001';
      let timestamp = Math.floor(Date.now() / 1000);

      await config.flightSuretyApp.registerFlight(firstAirline, flight, timestamp, { from: firstAirline });

      let isFlightRegistered = await config.flightSuretyApp.isFlightRegistered.call(firstAirline, flight, timestamp);
      assert.isTrue(isFlightRegistered, 'Flight is not registered');
  });

  it('(passenger) buy flight insurance', async () => {
    // 10 ETH
    let minFundAmount = config.minFundAmount;

    // AIRLINES
    let firstAirline = config.firstAirline;
    // Passenger
    let firstPassenger = config.firstPassenger;

    // FUND firstAirline
    await web3.eth.sendTransaction({
        from: firstAirline,
        to: config.flightSuretyData.address,
        value: minFundAmount,
    });

    let flight = 'LF0001';
    let timestamp = Math.floor(Date.now() / 1000);

    await config.flightSuretyApp.registerFlight(firstAirline, flight, timestamp, { from: firstAirline });

    // buy insurance
    let value = web3.utils.toWei("1", "ether");
    await config.flightSuretyApp.buyInsurance(firstAirline, flight, timestamp, { from: firstPassenger, value: value });

    let passengerHasInsurance = await config.flightSuretyApp.passengerHasInsurance.call(
        firstAirline, flight, timestamp, { from: firstPassenger }
    );

    assert.isTrue(passengerHasInsurance, 'Passenger has no insurance');
  });

  it('(airline / oracle) credit insurees', async () => {
    // 10 ETH
    let minFundAmount = config.minFundAmount;

    // AIRLINES
    let firstAirline = config.firstAirline;
    // Passenger
    let firstPassenger = config.firstPassenger;

    // FUND firstAirline
    await web3.eth.sendTransaction({
        from: firstAirline,
        to: config.flightSuretyData.address,
        value: minFundAmount,
    });

    let flight = 'LF0001';
    let timestamp = Math.floor(Date.now() / 1000);

    await config.flightSuretyApp.registerFlight(firstAirline, flight, timestamp, { from: firstAirline });

    // buy insurance
    let value = web3.utils.toWei("1", "ether");
    await config.flightSuretyApp.buyInsurance(firstAirline, flight, timestamp, { from: firstPassenger, value: value });

    let expectedCredit = web3.utils.toWei("1.5", "ether");

    // authorize an address to call function in data contract directly
    await config.flightSuretyData.authorizeCaller(firstAirline, { from: config.owner });

    // credit insurees
    await config.flightSuretyData.creditInsurees(firstAirline, flight, timestamp, { from: firstAirline });

    let actualCredit = await config.flightSuretyApp.getCreditValue.call(firstAirline, flight, timestamp, { from: firstPassenger });
    assert.equal(expectedCredit, actualCredit, "Insuree not credited as expected");
  });

  it('(passenger) withdraw credit', async () => {
    // 10 ETH
    let minFundAmount = config.minFundAmount;

    // AIRLINES
    let firstAirline = config.firstAirline;
    // Passenger
    let firstPassenger = config.firstPassenger;

    // FUND firstAirline
    await web3.eth.sendTransaction({
        from: firstAirline,
        to: config.flightSuretyData.address,
        value: minFundAmount,
    });

    let flight = 'LF0001';
    let timestamp = Math.floor(Date.now() / 1000);

    await config.flightSuretyApp.registerFlight(firstAirline, flight, timestamp, { from: firstAirline });

    // buy insurance
    let value = web3.utils.toWei("1", "ether");
    await config.flightSuretyApp.buyInsurance(firstAirline, flight, timestamp, { from: firstPassenger, value: value });

    let expectedCredit = web3.utils.toWei("1.5", "ether");

    // authorize an address to call function in data contract directly
    await config.flightSuretyData.authorizeCaller(firstAirline, { from: config.owner });

    // credit insurees
    await config.flightSuretyData.creditInsurees(firstAirline, flight, timestamp, { from: firstAirline });

    let actualCredit = await config.flightSuretyApp.getCreditValue.call(firstAirline, flight, timestamp, { from: firstPassenger });
    assert.equal(expectedCredit, actualCredit, "Insuree not credited as expected");

    // Passenger withdraws
    await config.flightSuretyApp.withdraw({ from: firstPassenger });
    let actualZeroCredit = await config.flightSuretyApp.getCreditValue.call(firstAirline, flight, timestamp, { from: firstPassenger });
    assert.equal(0, actualZeroCredit, "Insuree not credited as expected");
  });
});

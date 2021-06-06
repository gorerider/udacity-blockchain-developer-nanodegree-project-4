import DOM from './dom';
import Contract from './contract';
import Flights from './flights.json';
import './flightsurety.css';


(async() => {

    let result = null;

    let contract = new Contract('localhost', () => {

        // Read transaction
        contract.isOperational((error, result) => {
            console.log(error,result);
            display('Operational Status', 'Check if contract is operational', [ { label: 'Operational Status', error: error, value: result} ]);
        });

        // Log Flight Status Oracle Response
        contract.flightSuretyApp.events.FlightStatusInfo({
            fromBlock: "latest"
        }, function (error, result) {
            if (error) {
                return console.log(error)
            }

            console.log('Flight status info received', result.returnValues);
        });

        // Display
        contract.flightSuretyApp.events.InsureePayoutInfo({
            fromBlock: "latest"
        }, function (error, result) {
            if (error) {
                return console.log(error)
            }

            const insuranceCredit = result.returnValues[0];
            const insuranceCreditEth = contract.web3.utils.fromWei(insuranceCredit, 'ether');

            display(
                'Credit Withdrawal',
                '',
                [{ label: 'Total Withdrawn', error: error, value: insuranceCreditEth + ' ETH' }]
            );

            DOM.elid('checkCreditBalance').click();
        });

        // Insure Flight
        DOM.elid('buyInsurance').addEventListener('click', () => {
            let flight = DOM.elid('flightNumberInsurance').value;
            let value = DOM.elid('insuranceValue').value;
            let flightConfig = Flights.find((f) => { return f.flight === flight });

            contract.buyInsurance({
                airline: flightConfig.airline,
                flight: flightConfig.flight,
                timestamp: flightConfig.timestamp,
                value: value,
            }, (error, result) => {
                let statusText = error ? 'Error occurred while insuring' : 'Insured successfully with ' + value + ' ETH';
                let errorText = error ? JSON.stringify(error) : null;

                display(
                    'Flight Insurance Purchase',
                    'On Flight ' + flightConfig.flight,
                    [{ label: 'Status', error: errorText, value: statusText }]
                );
            });
        });
    

        // User-submitted transaction
        DOM.elid('submit-oracle').addEventListener('click', () => {
            let flight = DOM.elid('flight-number').value;
            let flightConfig = Flights.find((f) => { return f.flight === flight });

            // Write transaction
            contract.fetchFlightStatus({
                airline: flightConfig.airline,
                flight: flightConfig.flight,
                timestamp: flightConfig.timestamp
            }, (error, result) => {
                display('Oracles', 'Trigger oracles', [ { label: 'Fetch Flight Status', error: error, value: result.flight + ' ' + result.timestamp} ]);
            });
        })

        // Check Credit Balances
        DOM.elid('checkCreditBalance').addEventListener('click', () => {
            // Read credit value
            Flights.forEach(flightConfig => {
                contract.getCreditValue({
                    airline: flightConfig.airline,
                    flight: flightConfig.flight,
                    timestamp: flightConfig.timestamp
                }, (error, result) => {
                    DOM.elid('creditBalance' + flightConfig.flight).value = result;
                });
            });
        });

        DOM.elid('withdrawCreditBalance').addEventListener('click', () => {
            // Displayed by event listening above
            contract.withdraw(() => {});
        });
    });
    

})();


function display(title, description, results) {
    let displayDiv = DOM.elid("display-wrapper");
    let section = DOM.section();
    section.appendChild(DOM.h2(title));
    section.appendChild(DOM.h5(description));
    results.map((result) => {
        let row = section.appendChild(DOM.div({className:'row'}));
        row.appendChild(DOM.div({className: 'col-sm-4 field'}, result.label));
        row.appendChild(DOM.div({className: 'col-sm-8 field-value'}, result.error ? String(result.error) : String(result.value)));
        section.appendChild(row);
    })
    displayDiv.append(section);

}








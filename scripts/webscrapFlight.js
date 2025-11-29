

//1 - //https://www.skyscanner.fr/transport/vols/nyo/cope/?adultsv2=1&cabinclass=economy&childrenv2=&ref=home&rtn=1&preferdirects=false&outboundaltsenabled=false&inboundaltsenabled=false&oym=2501&iym=2501&selectedoday=01&selectediday=01

//2 - detect days in calendars :

let  depCal = document.querySelectorAll(".BpkCalendar_bpk-calendar__ZmU5M")[0]
let retCal = document.querySelectorAll(".BpkCalendar_bpk-calendar__ZmU5M")[1]
const clickEvent = new MouseEvent('click', {
	bubbles: true,  // Whether the event bubbles up through the DOM
	cancelable: true,  // Whether the event can be canceled
});

let inCal 
let week1
let friday
let inCal2
let week2 
let monday 
let price;
let link;

if(depCal && retCal){
	
	await new Promise(resolve => setTimeout(resolve, 2000));
	const modal = await document.querySelector("#modal-container");
	if (modal) modal.style.display = "none";

	

	await new Promise(resolve => setTimeout(resolve, 1000));
	const checkbox = await document.querySelector(".BpkCheckbox_bpk-checkbox__input__MTRlM");
	if (checkbox) checkbox.dispatchEvent(clickEvent);;

	const depCal = await document.querySelectorAll(".BpkCalendarGrid_bpk-calendar-grid__YjU0O")[0].children[0];
	let week1 = await depCal.children[1];
	let friday = await week1.children[4].children[0]; // Using .children for commented code
	

	const retCal = await document.querySelectorAll(".BpkCalendarGrid_bpk-calendar-grid__YjU0O")[1].children[0];
	let retCalCal = await retCal.children[1];
	let week2 = await retCalCal.children[2];
	let monday = await week2.children[0].children[0]; // Using .children for commented code
	console.log("tooo fast")
	const continueButton = await  document.querySelector(".month-view-variant__trip-summary-cta");
	


	await new Promise(resolve => setTimeout(resolve, 1700));
	if (friday) friday.dispatchEvent(clickEvent); // Uncommented
	await new Promise(resolve => setTimeout(resolve, 2300));
	if (monday) monday.dispatchEvent(clickEvent); // Uncommented
	await new Promise(resolve => setTimeout(resolve, 1000));
	// if (continueButton) continueButton.dispatchEvent(clickEvent); // Uncommented

}

//3 -  

let filterTab = document.querySelectorAll(".FqsTabs_fqsTabsWithSparkle__YWVmY")[0];
let secondTab = document.querySelectorAll(".BpkSegmentedControl_bpk-segmented-control__NzJjZ")[1];
let prices;
let links; 
let dataTicket = [] ;
let cardResults = document.querySelectorAll(".FlightsResults_dayViewItems__ZmU3Z")[0];


if(filterTab && secondTab){
	secondTab.dispatchEvent(clickEvent);
	if(cardResults){

		setTimeout(() => {
			for (let index = 0; index < 4; index++) {

				if(cardResults.children[index]){
					
					links = cardResults.children[index].querySelectorAll("a")[1]
					prices = cardResults.children[index].querySelectorAll(".BpkTicket_bpk-ticket__stub__ZWNhZ")[0].children[0].children[1].innerText;

					if(links == undefined){
						continue;
					}else{
						dataTicket.push({price: prices, link: links.href})
					}
					
				}
				
			}

		}, 2000);
	}
}

// 4
let dataaAgencies= [] ;
let cardAgenciesResult = document.querySelectorAll(".DetailsPanelContent_agentsListContainer__Zjc3N")[0];
let priceAgency ;
let agency ;

for (let index = 0; index < 4; index++) {

	if(cardAgenciesResult.children.length > 0){
		
		priceAgency = document.querySelectorAll(".TotalPrice_totalPrice__YmQyY")[index].innerText
		agency = document.querySelectorAll(".AgentDetails_agentNameContainer__M2Q4M p")[index].innerText
		dataaAgencies.push({agency: agency, priceAgency: priceAgency})
	}
	
}

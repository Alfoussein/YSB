
let citiesDepList =  [ 'Sarajevo',   'Sofia', 'Nicosia']
let countriesDepList = ['Bosnia and Herzegovina ',
  'Bulgaria ',
  'Cyprus '
]



for (let z = 0; z < 3; z++) {


    //             // Using page.evaluate to open a new window 
            let dataTicket = async (cityDepInputFile, countryDepInputFile) => {

                let cardList;
                let cardDetail;
                let city;
                let priceFrom;
                let country;
                let date;
                let card;
                let arr2 = [];
                let buttonSeemore;
                let container;
                let subCardListSize;
                let divDurations 
                let allButtons 
                let dropdownValueSelected

                let delay =  ms => new Promise(resolve => setTimeout(resolve, ms));

                await delay(7630)

                let inpp = document.querySelectorAll("._ibT")[0]
                let getIdFromChild = inpp.children[0].id

                const parts = getIdFromChild.split("-");

                // Take the first value
                const firstValue = parts[0];
                firstValue

                let inputFound = document.querySelector(`#${firstValue}-origin`)

                const clickEvent = new MouseEvent('click', {
                    bubbles: true,  // Whether the event bubbles up through the DOM
                    cancelable: true,  // Whether the event can be canceled
                });

                const mousedownEvent = new MouseEvent("mousedown", {
                    bubbles: true,
                    cancelable: true,
                    button: 0, // Left mouse button
                    buttons: 1,
                });
                
                // Create a mouseup event for left-click
                const mouseupEvent = new MouseEvent("mouseup", {
                    bubbles: true,
                    cancelable: true,
                    button: 0, // Left mouse button
                    buttons: 1,
                });


                let coockies = await document.querySelectorAll(".c1yxs.c1yxs-mod-visible")
                if(coockies.length > 0) await document.querySelectorAll(".P4zO-submit-buttons")[0].children[2].dispatchEvent(clickEvent)

                await inpp.dispatchEvent(clickEvent);

                await delay(4000)

                inputFound.value = ""

                const text = cityDepInputFile.trim();

                // Iterate over each character in the string
                if (typeof text === 'string') {
                    for (const char of text) {
                        // Create a keydown event for each character
                        const keyEvent = await new KeyboardEvent("keydown", {
                        key: char, // The actual key (e.g., 'h', 'e', etc.)
                        char: char,
                        keyCode: char.charCodeAt(0), // ASCII code of the character
                        which: char.charCodeAt(0), // ASCII code of the character
                        bubbles: true, // Ensures the event bubbles up the DOM
                        cancelable: true, // Allows the event to be canceled
                        });

                        // Dispatch the event to the input field
                        await inputFound.dispatchEvent(keyEvent);

                        inputFound.value += await char;

                    // Wait for 500 milliseconds before typing the next character
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }

                    await new Promise(resolve => setTimeout(resolve, 1300));
                    inputFound.dispatchEvent(mousedownEvent);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    inputFound.dispatchEvent(mouseupEvent);
                    await new Promise(resolve => setTimeout(resolve, 300));

                    dropdownValueSelected = document.querySelectorAll(`#${firstValue}-origin-smartbox-dropdown li`)[0]

                    
                    await delay(1650)
                    
                    // click open dropdown for month
                    dropdownValueSelected.dispatchEvent(clickEvent)
                    await delay(1650)
                    //////============= RAnge durations
                    divDurations = await document.querySelector(`#${firstValue}-dateRangeInput-display-start-inner`)
                    await divDurations.dispatchEvent(clickEvent);
                    await delay(1650)
                    allButtons = await  document.querySelector(`#${firstValue}-datePicker-rangeRadioBtnSet`).querySelectorAll("._iax")[0].click();
                    

                    // loop simulate click month
                    for (let f = 0; f < 3; f++) {


                        await delay(1650)
                        allButtons = await  document.querySelector(`#${firstValue}-datePicker-rangeRadioBtnSet`).querySelectorAll("._iax");
                        await delay(1000)
                        await allButtons[f].click()
                        await delay(2650)

                        ///// Simulate buttonclick 3 times
                        for (let i = 0; i < 1; i++) {

                            buttonSeemore = await document.querySelectorAll(".xzUt-button-content")[1] 
                            await buttonSeemore.dispatchEvent(clickEvent)   
                            await delay(1400)
                        }

                        container = await document.querySelectorAll(".anywhere-drawer")[0];
                        cardList = await  container.children[0].children[0].children[3]
                        
                        await delay(1000)  

                        ///// Loop select group of card
                        for (let h = 0; h < 1; h++) {

                            subCardListSize = await cardList.children[h].children[0].children.length
                            ///// Loop take data from card
                            for (let j = 0; j < subCardListSize; j++) {

                                card = await  cardList.children[h].children[0].querySelectorAll("._t")[j]
                                cardDetail = await  card.querySelectorAll("._eY")[0] ;
                                city = await  cardDetail.querySelectorAll("._ihz")[0].children[0]
                                if(city.textContent.includes("anything")) continue;
                                priceFrom = await  cardDetail.querySelectorAll("._ihz")[0].children[1]
                                country = await  cardDetail.querySelectorAll("._ibU")[0].children[0]
                                date = await  cardDetail.querySelectorAll("._ibU")[0].children[1]
                                priceFrom = priceFrom == undefined ? "N/A" : priceFrom.innerText;

                                const result = parseDateRange(date.innerText);
                                console.log("country in website", country.innerText);

                                arr2.push({cityDep: cityDepInputFile,
                                    countryDep: countryDepInputFile,
                                    cityDest: city.innerText, 
                                    countryDest: country.innerText, 
                                    priceFrom: priceFrom, 
                                    date: date.innerText, 
                                    depDay: result[0].depDay, 
                                    depMonth: result[0].depMonth, 
                                    retDay: result[0].retDay, 
                                    retMonth: result[0].retMonth
                                });
                            }
                        }
                        function parseDateRange(input) {
                            const months = {
                                Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
                                Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12"
                              };

                            
                            // Remove all periods from the input string
                            const cleanedInput = input.replaceAll('.', '');
                          
                            // Split the cleaned input into parts
                            const parts = cleanedInput.split(' - ');
                            const [depPart, retPart] = parts;
                          
                            // Extract date components
                            const [, depMonth, depDay] = depPart.split(' ');
                            const [, retMonth, retDay] = retPart.split(' ');
                             
                            
                            return [{
                              depDay: parseInt(depDay),
                              depMonth: months[depMonth],
                              retDay: parseInt(retDay),
                              retMonth: months[retMonth]
                            }]
                      }

                    }
                    await delay(2200)  
    
                }
                 await dataTicket( citiesDepList[z], countriesDepList[z]); // Example URL for window.open
            
    

            }
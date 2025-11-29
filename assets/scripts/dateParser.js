// Define the function to parse date range
function parseDateRange(dateRange) {
    // Define a map for month abbreviations to month numbers
    const monthMap = {
        "Jan": 1,
        "Feb": 2,
        "Mar": 3,
        "Apr": 4,
        "May": 5,
        "Jun": 6,
        "Jul": 7,
        "Aug": 8,
        "Sep": 9,
        "Oct": 10,
        "Nov": 11,
        "Dec": 12
    };

    // Match the pattern "Tue, Mar 25 - Mon, Mar 31" and extract relevant parts
    const regex = /(\w{3}), (\w{3}) (\d{1,2}) - (\w{3}), (\w{3}) (\d{1,2})/;
    const match = dateRange.match(regex);

    if (match) {
        const depDay = parseInt(match[3]);    // Departure day
        const depMonth = monthMap[match[2]];  // Departure month (numeric)
        const retDay = parseInt(match[6]);    // Return day
        const retMonth = monthMap[match[5]];  // Return month (numeric)

        return [{ depDay, depMonth, retDay, retMonth }];
    } else {
        throw new Error("Invalid date range format");
    }
}

// Export the function to be used in other files
module.exports = parseDateRange;

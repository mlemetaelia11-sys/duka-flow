const currentDateElement = document.querySelector("#current-date");

function updateCurrentDate() {
    const now = new Date();

    const formattedDate = now.toLocaleDateString("en-TZ", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });

    const formattedTime = now.toLocaleTimeString("en-TZ", {
        hour: "2-digit",
        minute: "2-digit"
    });

    currentDateElement.textContent = `${formattedDate} • ${formattedTime}`;
}

updateCurrentDate();

setInterval(updateCurrentDate, 1000);
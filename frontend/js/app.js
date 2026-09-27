const currentDateElement = document.querySelector("#current-date");

function updateCurrentDate() {
    if (!currentDateElement) {
        return;
    }

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


const productModal = document.querySelector("#product-modal");
const openProductModalButton = document.querySelector("#open-product-modal");
const closeModalButtons = document.querySelectorAll("[data-close-modal]");

function openProductModal() {
    if (!productModal) {
        return;
    }

    productModal.classList.add("is-open");
    productModal.setAttribute("aria-hidden", "false");
}

function closeProductModal() {
    if (!productModal) {
        return;
    }

    productModal.classList.remove("is-open");
    productModal.setAttribute("aria-hidden", "true");
}

if (openProductModalButton) {
    openProductModalButton.addEventListener("click", openProductModal);
}

closeModalButtons.forEach((button) => {
    button.addEventListener("click", closeProductModal);
});
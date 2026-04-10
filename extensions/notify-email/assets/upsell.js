document.addEventListener("DOMContentLoaded", () => {
  const productId = window.productId;

  const popup = document.getElementById("upsell-popup");
  const overlay = document.getElementById("upsell-overlay");
  const container = document.getElementById("upsell-products");
  const continueBtn = document.getElementById("upsell-continue");

  let selectedUpsells = [];

  // 🔹 STEP 1: Show popup on load
  setTimeout(() => {
    loadUpsells();
  }, 500);

  function loadUpsells() {
    fetch(`/recommendations/products.json?product_id=${productId}&limit=4`)
      .then(res => res.json())
      .then(data => {
        renderProducts(data.products);
        popup.classList.remove("hidden");
        overlay.classList.remove("hidden");
      });
  }

  // 🔹 STEP 2: Render products
  function renderProducts(products) {
    container.innerHTML = "";

    products.forEach(p => {
      const variantId = p.variants[0]?.id;

      container.innerHTML += `
        <div class="upsell-card">
          <img src="${p.featured_image}">
          <p>${p.title}</p>
          <p>₹${(p.price / 100).toFixed(2)}</p>

          <label>
            <input type="checkbox" value="${variantId}" class="upsell-check">
            Add
          </label>
        </div>
      `;
    });

    document.querySelectorAll(".upsell-check").forEach(input => {
      input.addEventListener("change", () => {
        if (input.checked) {
          selectedUpsells.push(input.value);
        } else {
          selectedUpsells = selectedUpsells.filter(id => id !== input.value);
        }
      });
    });
  }

  // 🔹 STEP 3: Close popup (SAVE selections)
  continueBtn?.addEventListener("click", () => {
    popup.classList.add("hidden");
    overlay.classList.add("hidden");

    // Save in localStorage (IMPORTANT 🔥)
    localStorage.setItem("upsellProducts", JSON.stringify(selectedUpsells));
  });

  // 🔹 STEP 4: Intercept Add to Cart
  const form = document.querySelector('form[action="/cart/add"]');

  form?.addEventListener("submit", (e) => {
    e.preventDefault();

    const formData = new FormData(form);
    const mainVariantId = formData.get("id");

    let upsells = JSON.parse(localStorage.getItem("upsellProducts")) || [];

    const items = [
      {
        id: mainVariantId,
        quantity: 1
      }
    ];

    upsells.forEach(id => {
      items.push({
        id: id,
        quantity: 1
      });
    });

    fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    }).then(() => {
      localStorage.removeItem("upsellProducts"); // clear after use
      window.location.href = "/cart";
    });
  });

  // Close
  document.querySelector(".upsell-close")?.addEventListener("click", closePopup);
  overlay?.addEventListener("click", closePopup);

  function closePopup() {
    popup.classList.add("hidden");
    overlay.classList.add("hidden");
  }
});


export async function action({ request }) {
  const formData = await request.formData();
  const email = formData.get("email");
  const variantId = formData.get("variantId");
  const inventoryItemId = formData.get("inventoryItemId");
  const shop = formData.get("shop");

  try {
    // Create subscription
    const subscription = await prisma.backInStock.create({
      data: {
        shop,
        email,
        variantId,
        inventoryItemId,
        notified: false,
        opened: false,
        clicked: false,
        purchased: false
      }
    });

    console.log(`✅ New subscription created: ${email} for variant ${variantId}`);

    return json({ 
      success: true, 
      message: "You'll be notified when this item is back in stock!",
      subscriptionId: subscription.id
    });
  } catch (error) {
    console.error("Error creating subscription:", error);
    return json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}
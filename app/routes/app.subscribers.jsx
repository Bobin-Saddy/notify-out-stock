// File: app/routes/app.subscribers.jsx
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Badge,
  Button,
  Text,
  BlockStack,
  InlineStack,
  EmptyState,
  TextField,
  Select,
  Banner,
  Box,
} from "@shopify/polaris";
import { useState, useCallback } from "react";

// Loader: Fetch all subscribers with detailed logging
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("search") || "";
  const filterStatus = url.searchParams.get("status") || "all";

  // Build where clause
  const whereClause = {
    shop: shop,
    ...(searchQuery && {
      OR: [
        { email: { contains: searchQuery } },
        { productTitle: { contains: searchQuery } },
        { variantTitle: { contains: searchQuery } },
      ],
    }),
    ...(filterStatus === "notified" && { notified: true }),
    ...(filterStatus === "pending" && { notified: false }),
  };

  const subscribers = await prisma.backInStock.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
  });

  console.log(`📊 Loaded ${subscribers.length} subscribers for shop: ${shop}`);
  
  // Debug: Log first subscriber to check data
  if (subscribers.length > 0) {
    console.log("🔍 Sample subscriber data:", {
      id: subscribers[0].id,
      email: subscribers[0].email,
      productTitle: subscribers[0].productTitle,
      variantTitle: subscribers[0].variantTitle,
      subscribedPrice: subscribers[0].subscribedPrice,
      variantId: subscribers[0].variantId,
      inventoryItemId: subscribers[0].inventoryItemId,
    });
  }

  const stats = {
    total: await prisma.backInStock.count({ where: { shop } }),
    notified: await prisma.backInStock.count({ where: { shop, notified: true } }),
    pending: await prisma.backInStock.count({ where: { shop, notified: false } }),
    withProductInfo: await prisma.backInStock.count({ 
      where: { shop, productTitle: { not: null } } 
    }),
  };

  return json({ subscribers, stats, shop });
};

// Action: Handle CSV export
export const action = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const formData = await request.formData();
    const actionType = formData.get("action");

    console.log("📥 Action called:", actionType, "for shop:", shop);

    if (actionType === "export") {
      const subscribers = await prisma.backInStock.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
      });

      console.log(`📊 Exporting ${subscribers.length} subscribers`);

      if (subscribers.length === 0) {
        return new Response("No subscribers to export", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      }

      // Generate CSV with proper escaping
      const csvHeaders = [
        "ID",
        "Email",
        "Product Title",
        "Variant Title",
        "Subscribed Price",
        "Variant ID",
        "Inventory Item ID",
        "Notified",
        "Opened",
        "Clicked",
        "Created At",
        "Updated At",
      ];

      const csvRows = subscribers.map((sub) => [
        sub.id || "",
        sub.email || "",
        sub.productTitle || "",
        sub.variantTitle || "",
        sub.subscribedPrice != null ? `$${Number(sub.subscribedPrice).toFixed(2)}` : "",
        sub.variantId || "",
        sub.inventoryItemId || "",
        sub.notified ? "Yes" : "No",
        sub.opened ? "Yes" : "No",
        sub.clicked ? "Yes" : "No",
        sub.createdAt ? new Date(sub.createdAt).toLocaleString() : "",
        sub.updatedAt ? new Date(sub.updatedAt).toLocaleString() : "",
      ]);

      const escapeCSVField = (field) => {
        const stringField = String(field);
        if (stringField.includes(",") || stringField.includes('"') || stringField.includes("\n")) {
          return `"${stringField.replace(/"/g, '""')}"`;
        }
        return stringField;
      };

      const csvContent = [
        csvHeaders.map(escapeCSVField).join(","),
        ...csvRows.map((row) => row.map(escapeCSVField).join(",")),
      ].join("\n");

      const timestamp = new Date().toISOString().split('T')[0];

      console.log("✅ CSV generated successfully");

      return new Response(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="subscribers-${timestamp}.csv"`,
        },
      });
    }

    return json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("❌ Export error:", error);
    return json({ error: error.message }, { status: 500 });
  }
};

export default function SubscribersPage() {
  const { subscribers, stats } = useLoaderData();
  const navigate = useNavigate();

  const [searchValue, setSearchValue] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const handleSearchChange = useCallback((value) => {
    setSearchValue(value);
  }, []);

  const handleFilterChange = useCallback((value) => {
    setFilterStatus(value);
  }, []);

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams();
    if (searchValue) params.set("search", searchValue);
    if (filterStatus !== "all") params.set("status", filterStatus);
    navigate(`?${params.toString()}`);
  }, [searchValue, filterStatus, navigate]);

  // Check if we have product data issues
  const hasProductDataIssues = stats.withProductInfo < stats.total;

  const rows = subscribers.map((sub) => [
    sub.id,
    sub.email,
    sub.productTitle ? (
      <Box>
        <Text fontWeight="semibold">{sub.productTitle}</Text>
        {sub.variantTitle && (
          <Text tone="subdued" variant="bodySm">
            {sub.variantTitle}
          </Text>
        )}
      </Box>
    ) : (
      <Text tone="critical">No product data</Text>
    ),
    sub.subscribedPrice != null ? (
      <Text fontWeight="semibold">
        ${Number(sub.subscribedPrice).toFixed(2)}
      </Text>
    ) : (
      <Text tone="subdued">—</Text>
    ),
    <Badge tone={sub.notified ? "success" : "attention"}>
      {sub.notified ? "Notified" : "Pending"}
    </Badge>,
    <Badge tone={sub.opened ? "success" : undefined}>
      {sub.opened ? "✓ Opened" : "Not opened"}
    </Badge>,
    <Badge tone={sub.clicked ? "success" : undefined}>
      {sub.clicked ? "✓ Clicked" : "Not clicked"}
    </Badge>,
    sub.createdAt ? (
      <Text variant="bodySm">
        {new Date(sub.createdAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}
      </Text>
    ) : (
      "—"
    ),
  ]);

  const filterOptions = [
    { label: "All Subscribers", value: "all" },
    { label: "Pending Notifications", value: "pending" },
    { label: "Already Notified", value: "notified" },
  ];

  return (
    <Page
      title="Back in Stock Subscribers"
      primaryAction={{
        content: "Export CSV",
        onAction: () => {
          const form = document.createElement("form");
          form.method = "POST";
          form.action = "";
          
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = "action";
          input.value = "export";
          form.appendChild(input);
          
          document.body.appendChild(form);
          form.submit();
          document.body.removeChild(form);
        },
      }}
    >
      <Layout>
        {/* Warning Banner if product data is missing */}
        {hasProductDataIssues && (
          <Layout.Section>
            <Banner tone="warning" title="Missing Product Information">
              <p>
                Some subscribers ({stats.total - stats.withProductInfo} out of {stats.total}) 
                don't have product information saved. This might be due to old subscriptions 
                created before the product tracking feature was added. New subscriptions should 
                capture this data automatically.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {/* Stats Cards */}
        <Layout.Section>
          <InlineStack gap="400" wrap={false}>
            <Card>
              <BlockStack gap="200">
                <Text variant="bodyMd" tone="subdued">Total Subscribers</Text>
                <Text variant="heading2xl" as="p">{stats.total}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text variant="bodyMd" tone="subdued">Pending</Text>
                <Text variant="heading2xl" as="p" tone="warning">{stats.pending}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text variant="bodyMd" tone="subdued">Notified</Text>
                <Text variant="heading2xl" as="p" tone="success">{stats.notified}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text variant="bodyMd" tone="subdued">With Product Data</Text>
                <Text variant="heading2xl" as="p">{stats.withProductInfo}</Text>
              </BlockStack>
            </Card>
          </InlineStack>
        </Layout.Section>

        {/* Filters */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="400" align="start" blockAlign="end" wrap={false}>
                <Box width="100%">
                  <TextField
                    label="Search"
                    value={searchValue}
                    onChange={handleSearchChange}
                    placeholder="Search by email or product name"
                    autoComplete="off"
                    clearButton
                    onClearButtonClick={() => setSearchValue("")}
                  />
                </Box>
                <Box minWidth="200px">
                  <Select
                    label="Filter by status"
                    options={filterOptions}
                    value={filterStatus}
                    onChange={handleFilterChange}
                  />
                </Box>
                <Button variant="primary" onClick={handleSearch}>
                  Search
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Subscribers Table */}
        <Layout.Section>
          <Card padding="0">
            {subscribers.length === 0 ? (
              <EmptyState
                heading="No subscribers found"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  {searchValue || filterStatus !== "all" 
                    ? "Try adjusting your search or filters."
                    : "Subscribers will appear here when customers sign up for back in stock notifications."}
                </p>
              </EmptyState>
            ) : (
              <DataTable
                columnContentTypes={[
                  "numeric",
                  "text",
                  "text",
                  "text",
                  "text",
                  "text",
                  "text",
                  "text",
                ]}
                headings={[
                  "ID",
                  "Email",
                  "Product & Variant",
                  "Price",
                  "Status",
                  "Email Opened",
                  "Link Clicked",
                  "Subscribed Date",
                ]}
                rows={rows}
                hoverable
              />
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
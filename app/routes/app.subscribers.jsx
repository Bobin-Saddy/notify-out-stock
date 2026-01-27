// File: app/routes/app.subscribers.jsx
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, Form } from "react-router";
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
} from "@shopify/polaris";
import { useState, useCallback } from "react";

// Loader: Fetch all subscribers
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

  const stats = {
    total: await prisma.backInStock.count({ where: { shop } }),
    notified: await prisma.backInStock.count({ where: { shop, notified: true } }),
    pending: await prisma.backInStock.count({ where: { shop, notified: false } }),
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

      // Properly escape CSV fields
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

  const rows = subscribers.map((sub) => [
    sub.id,
    sub.email,
    sub.productTitle || <Text tone="subdued">No product title</Text>,
    sub.variantTitle || <Text tone="subdued">Default variant</Text>,
    sub.subscribedPrice != null 
      ? `$${Number(sub.subscribedPrice).toFixed(2)}` 
      : <Text tone="subdued">N/A</Text>,
    <Badge tone={sub.notified ? "success" : "info"}>
      {sub.notified ? "✅ Notified" : "⏳ Pending"}
    </Badge>,
    <Badge tone={sub.opened ? "success" : ""}>{sub.opened ? "Yes" : "No"}</Badge>,
    <Badge tone={sub.clicked ? "success" : ""}>{sub.clicked ? "Yes" : "No"}</Badge>,
    sub.createdAt 
      ? new Date(sub.createdAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        })
      : "N/A",
  ]);

  const filterOptions = [
    { label: "All", value: "all" },
    { label: "Pending", value: "pending" },
    { label: "Notified", value: "notified" },
  ];

  return (
    <Page
      title="📬 Back in Stock Subscribers"
      primaryAction={{
        content: "📥 Export CSV",
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
        {/* Stats Cards */}
        <Layout.Section>
          <InlineStack gap="400">
            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">Total Subscribers</Text>
                <Text variant="heading2xl" as="p">{stats.total}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">Pending</Text>
                <Text variant="heading2xl" as="p">{stats.pending}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">Notified</Text>
                <Text variant="heading2xl" as="p">{stats.notified}</Text>
              </BlockStack>
            </Card>
          </InlineStack>
        </Layout.Section>

        {/* Filters */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="400" align="start">
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Search"
                    value={searchValue}
                    onChange={handleSearchChange}
                    placeholder="Search by email or product"
                    autoComplete="off"
                  />
                </div>
                <div style={{ minWidth: "200px" }}>
                  <Select
                    label="Filter by status"
                    options={filterOptions}
                    value={filterStatus}
                    onChange={handleFilterChange}
                  />
                </div>
                <div style={{ paddingTop: "26px" }}>
                  <Button onClick={handleSearch}>🔍 Search</Button>
                </div>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Subscribers Table */}
        <Layout.Section>
          <Card padding="0">
            {subscribers.length === 0 ? (
              <EmptyState
                heading="No subscribers yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Subscribers will appear here when customers sign up for back in stock notifications.</p>
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
                  "text",
                ]}
                headings={[
                  "ID",
                  "Email",
                  "Product",
                  "Variant",
                  "Subscribed Price",
                  "Status",
                  "Opened",
                  "Clicked",
                  "Date",
                ]}
                rows={rows}
              />
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
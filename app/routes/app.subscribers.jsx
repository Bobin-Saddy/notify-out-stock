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
  InlineGrid,
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

  const whereClause = {
    shop,
    ...(searchQuery && {
      OR: [
        { email: { contains: searchQuery, mode: "insensitive" } },
        { productTitle: { contains: searchQuery, mode: "insensitive" } },
        { variantTitle: { contains: searchQuery, mode: "insensitive" } },
      ],
    }),
    ...(filterStatus === "notified" && { notified: true }),
    ...(filterStatus === "pending" && { notified: false }),
    ...(filterStatus === "purchased" && { purchased: true }),
  };

  const subscribers = await prisma.backInStock.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
  });

  const stats = {
    total: await prisma.backInStock.count({ where: { shop } }),
    notified: await prisma.backInStock.count({ where: { shop, notified: true } }),
    pending: await prisma.backInStock.count({ where: { shop, notified: false } }),
    purchased: await prisma.backInStock.count({ where: { shop, purchased: true } }),
  };

  return json({ subscribers, stats });
};

// Action: Handle CSV export
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const actionType = formData.get("action");

  if (actionType === "export") {
    const subscribers = await prisma.backInStock.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    });

    const csvHeaders = [
      "ID",
      "Email",
      "Product Title",
      "Variant Title",
      "Subscribed Price",
      "Notified",
      "Opened",
      "Clicked",
      "Purchased",
      "Created At",
      "Updated At",
    ];

    const csvRows = subscribers.map((sub) => [
      sub.id,
      sub.email,
      sub.productTitle || "",
      sub.variantTitle || "",
      sub.subscribedPrice || "",
      sub.notified ? "Yes" : "No",
      sub.opened ? "Yes" : "No",
      sub.clicked ? "Yes" : "No",
      sub.purchased ? "Yes" : "No",
      new Date(sub.createdAt).toLocaleString(),
      new Date(sub.updatedAt).toLocaleString(),
    ]);

    const csvContent = [
      csvHeaders.join(","),
      ...csvRows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="subscribers-${new Date().toISOString()}.csv"`,
      },
    });
  }

  return json({ error: "Invalid action" }, { status: 400 });
};

export default function SubscribersPage() {
  const { subscribers, stats } = useLoaderData();
  const navigate = useNavigate();

  const [searchValue, setSearchValue] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams();
    if (searchValue) params.set("search", searchValue);
    if (filterStatus !== "all") params.set("status", filterStatus);
    navigate(`?${params.toString()}`);
  }, [searchValue, filterStatus, navigate]);

  const handleExport = () => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/app/subscribers";

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "action";
    input.value = "export";
    form.appendChild(input);

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  };

  const rows = subscribers.map((sub) => [
    sub.id,
    sub.email,
    sub.productTitle || "N/A",
    sub.variantTitle || "N/A",
    sub.subscribedPrice ? `$${sub.subscribedPrice.toFixed(2)}` : "N/A",
    <Badge tone={sub.notified ? "success" : "warning"}>
      {sub.notified ? "Notified" : "Pending"}
    </Badge>,
    <Badge tone={sub.opened ? "success" : "subdued"}>{sub.opened ? "Yes" : "No"}</Badge>,
    <Badge tone={sub.clicked ? "success" : "subdued"}>{sub.clicked ? "Yes" : "No"}</Badge>,
    <Badge tone={sub.purchased ? "success" : "subdued"}>{sub.purchased ? "Yes" : "No"}</Badge>,
    new Date(sub.createdAt).toLocaleDateString(),
  ]);

  const filterOptions = [
    { label: "All", value: "all" },
    { label: "Pending", value: "pending" },
    { label: "Notified", value: "notified" },
    { label: "Purchased", value: "purchased" },
  ];

  return (
    <Page
      title="Back in Stock Subscribers"
      primaryAction={{ content: "Export CSV", onAction: handleExport }}
    >
      <Layout>

        {/* Stats */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            <Card><BlockStack gap="100"><Text as="h2" variant="headingSm">Total</Text><Text variant="heading2xl">{stats.total}</Text></BlockStack></Card>
            <Card><BlockStack gap="100"><Text as="h2" variant="headingSm">Pending</Text><Text variant="heading2xl">{stats.pending}</Text></BlockStack></Card>
            <Card><BlockStack gap="100"><Text as="h2" variant="headingSm">Notified</Text><Text variant="heading2xl">{stats.notified}</Text></BlockStack></Card>
            <Card><BlockStack gap="100"><Text as="h2" variant="headingSm">Purchased</Text><Text variant="heading2xl">{stats.purchased}</Text></BlockStack></Card>
          </InlineGrid>
        </Layout.Section>

        {/* Filters */}
        <Layout.Section>
          <Card>
            <InlineStack gap="400" align="end">
              <div style={{ flex: 1 }}>
                <TextField label="Search" value={searchValue} onChange={setSearchValue} autoComplete="off" />
              </div>
              <div style={{ width: 200 }}>
                <Select label="Status" options={filterOptions} value={filterStatus} onChange={setFilterStatus} />
              </div>
              <div style={{ paddingTop: 22 }}>
                <Button onClick={handleSearch}>Apply</Button>
              </div>
            </InlineStack>
          </Card>
        </Layout.Section>

        {/* Table */}
        <Layout.Section>
          <Card padding="0">
            {subscribers.length === 0 ? (
              <EmptyState
                heading="No subscribers yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Customers will appear here after subscribing.</p>
              </EmptyState>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <DataTable
                  columnContentTypes={["numeric","text","text","text","text","text","text","text","text","text"]}
                  headings={["ID","Email","Product","Variant","Price","Status","Opened","Clicked","Purchased","Date"]}
                  rows={rows}
                />
              </div>
            )}
          </Card>
        </Layout.Section>

      </Layout>
    </Page>
  );
}

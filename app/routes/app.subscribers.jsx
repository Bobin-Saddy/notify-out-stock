import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

import {
  Page,
  Layout,
  Card,
  Badge,
  Button,
  Text,
  BlockStack,
  InlineStack,
  EmptyState,
  TextField,
  Select,
  IndexTable,
  useIndexResourceState,
} from "@shopify/polaris";

import { useState, useCallback } from "react";

// ================= LOADER =================
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

// ================= ACTION =================
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
      "Product",
      "Variant",
      "Price",
      "Notified",
      "Opened",
      "Clicked",
      "Purchased",
      "Created At",
    ];

    const csvRows = subscribers.map((s) => [
      s.id,
      s.email,
      s.productTitle || "",
      s.variantTitle || "",
      s.subscribedPrice || "",
      s.notified ? "Yes" : "No",
      s.opened ? "Yes" : "No",
      s.clicked ? "Yes" : "No",
      s.purchased ? "Yes" : "No",
      new Date(s.createdAt).toLocaleString(),
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
        "Content-Disposition": `attachment; filename="subscribers.csv"`,
      },
    });
  }

  return json({ error: "Invalid action" }, { status: 400 });
};

// ================= PAGE =================
export default function SubscribersPage() {
  const { subscribers, stats } = useLoaderData();
  const navigate = useNavigate();

  const [searchValue, setSearchValue] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(subscribers);

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (searchValue) params.set("search", searchValue);
    if (filterStatus !== "all") params.set("status", filterStatus);
    navigate(`?${params.toString()}`);
  };

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
        {/* ===== Stats ===== */}
        <Layout.Section>
          <InlineStack gap="400">
            <StatCard title="Total" value={stats.total} />
            <StatCard title="Pending" value={stats.pending} />
            <StatCard title="Notified" value={stats.notified} />
            <StatCard title="Purchased" value={stats.purchased} />
          </InlineStack>
        </Layout.Section>

        {/* ===== Filters ===== */}
        <Layout.Section>
          <Card>
            <InlineStack gap="400" align="start">
              <div style={{ flex: 1 }}>
                <TextField
                  label="Search"
                  value={searchValue}
                  onChange={setSearchValue}
                />
              </div>
              <div style={{ minWidth: 200 }}>
                <Select
                  label="Status"
                  options={filterOptions}
                  value={filterStatus}
                  onChange={setFilterStatus}
                />
              </div>
              <div style={{ paddingTop: 26 }}>
                <Button onClick={handleSearch}>Search</Button>
              </div>
            </InlineStack>
          </Card>
        </Layout.Section>

        {/* ===== Table ===== */}
        <Layout.Section>
          <Card padding="0">
            {subscribers.length === 0 ? (
              <EmptyState
                heading="No subscribers yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Subscribers will appear here when customers subscribe.</p>
              </EmptyState>
            ) : (
              <IndexTable
                resourceName={{ singular: "subscriber", plural: "subscribers" }}
                itemCount={subscribers.length}
                selectedItemsCount={
                  allResourcesSelected ? "All" : selectedResources.length
                }
                onSelectionChange={handleSelectionChange}
                headings={[
                  { title: "Email" },
                  { title: "Product" },
                  { title: "Variant" },
                  { title: "Price" },
                  { title: "Status" },
                  { title: "Opened" },
                  { title: "Clicked" },
                  { title: "Purchased" },
                  { title: "Date" },
                ]}
              >
                {subscribers.map((s, index) => (
                  <IndexTable.Row
                    id={s.id}
                    key={s.id}
                    position={index}
                    selected={selectedResources.includes(s.id)}
                  >
                    <IndexTable.Cell>{s.email}</IndexTable.Cell>
                    <IndexTable.Cell>{s.productTitle || "—"}</IndexTable.Cell>
                    <IndexTable.Cell>{s.variantTitle || "—"}</IndexTable.Cell>
                    <IndexTable.Cell>
                      {s.subscribedPrice ? `$${s.subscribedPrice}` : "—"}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={s.notified ? "success" : "info"}>
                        {s.notified ? "Notified" : "Pending"}
                      </Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{s.opened ? "Yes" : "No"}</IndexTable.Cell>
                    <IndexTable.Cell>{s.clicked ? "Yes" : "No"}</IndexTable.Cell>
                    <IndexTable.Cell>{s.purchased ? "Yes" : "No"}</IndexTable.Cell>
                    <IndexTable.Cell>
                      {new Date(s.createdAt).toLocaleDateString()}
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// ================= Small Component =================
function StatCard({ title, value }) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text variant="headingMd">{title}</Text>
        <Text variant="heading2xl">{value}</Text>
      </BlockStack>
    </Card>
  );
}

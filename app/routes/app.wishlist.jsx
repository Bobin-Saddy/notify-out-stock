// File: app/routes/app.wishlist.jsx
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
  Text,
  BlockStack,
  InlineStack,
  EmptyState,
  TextField,
  Button,
  Box,
  Thumbnail,
} from "@shopify/polaris";
import { useState, useCallback } from "react";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("search") || "";

  const whereClause = {
    shop: shop,
    ...(searchQuery && {
      OR: [
        { email: { contains: searchQuery } },
        { productTitle: { contains: searchQuery } },
      ],
    }),
  };

  const wishlistItems = await prisma.wishlist.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
  });

  console.log(`💚 Loaded ${wishlistItems.length} wishlist items for shop: ${shop}`);

  const stats = {
    total: await prisma.wishlist.count({ where: { shop } }),
    uniqueProducts: await prisma.wishlist.groupBy({
      by: ['productId'],
      where: { shop },
      _count: true
    }).then(items => items.length),
    uniqueCustomers: await prisma.wishlist.groupBy({
      by: ['email'],
      where: { shop },
      _count: true
    }).then(items => items.length),
  };

  return json({ wishlistItems, stats, shop });
};

export default function WishlistPage() {
  const { wishlistItems, stats } = useLoaderData();
  const navigate = useNavigate();

  const [searchValue, setSearchValue] = useState("");

  const handleSearchChange = useCallback((value) => {
    setSearchValue(value);
  }, []);

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams();
    if (searchValue) params.set("search", searchValue);
    navigate(`?${params.toString()}`);
  }, [searchValue, navigate]);

  const rows = wishlistItems.map((item) => [
    item.productImage ? (
      <Thumbnail
        source={item.productImage}
        alt={item.productTitle}
        size="small"
      />
    ) : (
      <Thumbnail
        source="https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png"
        alt="No image"
        size="small"
      />
    ),
    <Box>
      <Text fontWeight="semibold">{item.productTitle}</Text>
      {item.variantTitle && item.variantTitle !== 'Default' && (
        <Text tone="subdued" variant="bodySm">
          {item.variantTitle}
        </Text>
      )}
    </Box>,
    item.email,
    item.price != null ? (
      <Text fontWeight="semibold">
        ${Number(item.price).toFixed(2)}
      </Text>
    ) : (
      <Text tone="subdued">—</Text>
    ),
    item.createdAt ? (
      <Text variant="bodySm">
        {new Date(item.createdAt).toLocaleDateString('en-US', {
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

  return (
    <Page title="Customer Wishlists">
      <Layout>
        {/* Stats Cards */}
        <Layout.Section>
          <InlineStack gap="400" wrap={false}>
            <Card>
              <BlockStack gap="200">
                <Text variant="bodyMd" tone="subdued">Total Wishlist Items</Text>
                <Text variant="heading2xl" as="p">{stats.total}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text variant="bodyMd" tone="subdued">Unique Products</Text>
                <Text variant="heading2xl" as="p">{stats.uniqueProducts}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text variant="bodyMd" tone="subdued">Unique Customers</Text>
                <Text variant="heading2xl" as="p">{stats.uniqueCustomers}</Text>
              </BlockStack>
            </Card>
          </InlineStack>
        </Layout.Section>

        {/* Search */}
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
                <Button variant="primary" onClick={handleSearch}>
                  Search
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Wishlist Table */}
        <Layout.Section>
          <Card padding="0">
            {wishlistItems.length === 0 ? (
              <EmptyState
                heading="No wishlist items yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  {searchValue 
                    ? "Try adjusting your search."
                    : "Wishlist items will appear here when customers add products to their wishlist."}
                </p>
              </EmptyState>
            ) : (
              <DataTable
                columnContentTypes={[
                  "text",
                  "text",
                  "text",
                  "text",
                  "text",
                ]}
                headings={[
                  "Product Image",
                  "Product & Variant",
                  "Customer Email",
                  "Price",
                  "Added Date",
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
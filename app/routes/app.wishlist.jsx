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
  Text,
  BlockStack,
  InlineStack,
  EmptyState,
  TextField,
  Button,
  Box,
  Thumbnail,
  Link,
} from "@shopify/polaris";

import { useState, useCallback } from "react";

// =========================
// LOADER
// =========================
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);

  const searchQuery = url.searchParams.get("search") || "";
  const page = Number(url.searchParams.get("page") || 1);
  const limit = 20;
  const skip = (page - 1) * limit;

  // =========================
  // WHERE CLAUSE
  // =========================
  const whereClause = {
    shop,
    ...(searchQuery && {
      OR: [
        {
          email: {
            contains: searchQuery,
            mode: "insensitive",
          },
        },
        {
          productTitle: {
            contains: searchQuery,
            mode: "insensitive",
          },
        },
      ],
    }),
  };

  // =========================
  // PARALLEL QUERIES (FAST)
  // =========================
  const [wishlistItems, total, uniqueProducts, uniqueCustomers] =
    await Promise.all([
      prisma.wishlist.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),

      prisma.wishlist.count({ where: { shop } }),

      prisma.wishlist
        .groupBy({
          by: ["productId"],
          where: { shop },
        })
        .then((r) => r.length),

      prisma.wishlist
        .groupBy({
          by: ["email"],
          where: { shop },
        })
        .then((r) => r.length),
    ]);

  return json({
    wishlistItems,
    stats: {
      total,
      uniqueProducts,
      uniqueCustomers,
    },
    pagination: {
      page,
      hasNext: wishlistItems.length === limit,
      hasPrev: page > 1,
    },
    shop,
    searchQuery,
  });
};

// =========================
// COMPONENT
// =========================
export default function WishlistPage() {
  const { wishlistItems, stats, pagination, shop, searchQuery } =
    useLoaderData();

  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState(searchQuery || "");

  // =========================
  // SEARCH
  // =========================
  const handleSearch = useCallback(() => {
    const params = new URLSearchParams();
    if (searchValue) params.set("search", searchValue);
    navigate(`?${params.toString()}`);
  }, [searchValue, navigate]);

  // =========================
  // PAGINATION
  // =========================
  const goToPage = (page) => {
    const params = new URLSearchParams();
    if (searchValue) params.set("search", searchValue);
    params.set("page", page);
    navigate(`?${params.toString()}`);
  };

  // =========================
  // TABLE ROWS
  // =========================
  const rows = wishlistItems.map((item) => [
    <Thumbnail
      source={
        item.productImage ||
        "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png"
      }
      alt={item.productTitle || "Product"}
      size="small"
    />,

    <Box>
      <Text fontWeight="semibold">
        <Link
          url={`https://${shop}/products/${item.productHandle}`}
          target="_blank"
          removeUnderline
        >
          {item.productTitle || "Untitled"}
        </Link>
      </Text>

      {item.variantTitle && item.variantTitle !== "Default" && (
        <Text tone="subdued" variant="bodySm">
          {item.variantTitle}
        </Text>
      )}
    </Box>,

    item.email || "—",

    item.price != null ? (
      <Text fontWeight="semibold">
        ${Number(item.price).toFixed(2)}
      </Text>
    ) : (
      "—"
    ),

    item.createdAt
      ? new Date(item.createdAt).toLocaleString()
      : "—",
  ]);

  return (
    <Page title="Customer Wishlists">
      <Layout>

        {/* =========================
            STATS
        ========================= */}
        <Layout.Section>
          <InlineStack gap="400">
            <Card>
              <BlockStack>
                <Text tone="subdued">Total Items</Text>
                <Text variant="heading2xl">{stats.total}</Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack>
                <Text tone="subdued">Products</Text>
                <Text variant="heading2xl">{stats.uniqueProducts}</Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack>
                <Text tone="subdued">Customers</Text>
                <Text variant="heading2xl">{stats.uniqueCustomers}</Text>
              </BlockStack>
            </Card>
          </InlineStack>
        </Layout.Section>

        {/* =========================
            SEARCH
        ========================= */}
        <Layout.Section>
          <Card>
            <InlineStack gap="300">
              <TextField
                label="Search"
                value={searchValue}
                onChange={setSearchValue}
                placeholder="Email or product..."
                autoComplete="off"
              />
              <Button variant="primary" onClick={handleSearch}>
                Search
              </Button>
            </InlineStack>
          </Card>
        </Layout.Section>

        {/* =========================
            TABLE
        ========================= */}
        <Layout.Section>
          <Card padding="0">
            {wishlistItems.length === 0 ? (
              <EmptyState
                heading="No wishlist items"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  {searchValue
                    ? "No results found."
                    : "Customers haven't added items yet."}
                </p>
              </EmptyState>
            ) : (
              <>
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text"]}
                  headings={[
                    "Image",
                    "Product",
                    "Customer",
                    "Price",
                    "Date",
                  ]}
                  rows={rows}
                />

                {/* =========================
                    PAGINATION
                ========================= */}
                <Box padding="400">
                  <InlineStack align="space-between">
                    <Button
                      disabled={!pagination.hasPrev}
                      onClick={() => goToPage(pagination.page - 1)}
                    >
                      Previous
                    </Button>

                    <Text>Page {pagination.page}</Text>

                    <Button
                      disabled={!pagination.hasNext}
                      onClick={() => goToPage(pagination.page + 1)}
                    >
                      Next
                    </Button>
                  </InlineStack>
                </Box>
              </>
            )}
          </Card>
        </Layout.Section>

      </Layout>
    </Page>
  );
}
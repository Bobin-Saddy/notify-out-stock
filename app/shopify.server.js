import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },

  // ✅ Simplified webhook registration using GraphQL
hooks: {
  afterAuth: async ({ session, admin }) => {
    console.log("🔗 Registering webhooks for shop:", session.shop);
    
    try {
      const response = await admin.graphql(
        `mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription {
              id
              topic
            }
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            topic: "PRODUCTS_UPDATE",
            webhookSubscription: {
              // ✅ Single slash, no leading slash
              callbackUrl: `${process.env.SHOPIFY_APP_URL}/routes/webhooks/products-update`,
              format: "JSON"
            }
          }
        }
      );
      
      const result = await response.json();
      console.log("✅ Webhook registered:", result.data.webhookSubscriptionCreate.webhookSubscription);
    } catch (error) {
      console.error("❌ Webhook registration failed:", error.message);
    }
  },
},

webhooks: {
  PRODUCTS_UPDATE: {
    deliveryMethod: "http",
    // ✅ No leading slash
    callbackUrl: "/routes/webhooks/products-update",
  },
},

  // ✅ Define PRODUCTS_UPDATE webhook
  webhooks: {
    PRODUCTS_UPDATE: {
      deliveryMethod: "http",
      callbackUrl: "/routes/webhooks/products-update",
    },
  },

  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;

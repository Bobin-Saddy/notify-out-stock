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

  // ✅ Register webhook after OAuth
  hooks: {
    afterAuth: async ({ session, admin }) => {
      console.log("🔗 Registering webhooks for shop:", session.shop);
      
      try {
        // Register PRODUCTS_UPDATE webhook
        const response = await admin.rest.post({
          path: 'webhooks',
          data: {
            webhook: {
              topic: 'products/update',
              address: `${process.env.SHOPIFY_APP_URL}/webhooks/products-update`,
              format: 'json'
            }
          }
        });
        
        console.log("✅ Webhook registered:", response);
      } catch (error) {
        console.error("❌ Webhook registration failed:", error);
      }
    },
  },

  // ✅ Define webhooks
  webhooks: {
    PRODUCTS_UPDATE: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks/products-update",
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
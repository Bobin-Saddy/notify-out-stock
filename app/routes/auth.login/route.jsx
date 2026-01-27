import { useState } from "react";
import { Form, useActionData, useLoaderData } from "react-router";
import { AppProvider as PolarisProvider, Page, Card, TextField, Button } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export const action = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export default function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();

  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;

  return (
    <PolarisProvider i18n={enTranslations}>
      <Page title="Log in">
        <Card sectioned>
          <Form method="post">
            <TextField
              label="Shop domain"
              name="shop"
              value={shop}
              onChange={setShop}
              helpText="example.myshopify.com"
              error={errors?.shop}
              autoComplete="on"
            />

            <div style={{ marginTop: "16px" }}>
              <Button submit primary>
                Log in
              </Button>
            </div>
          </Form>
        </Card>
      </Page>
    </PolarisProvider>
  );
}

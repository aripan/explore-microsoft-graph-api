
import "isomorphic-fetch";
import { Context, HttpRequest } from "@azure/functions";
import {
  OnBehalfOfCredentialAuthConfig,
  OnBehalfOfUserCredential,
  UserInfo,
} from "@microsoft/teamsfx";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import config from "../config";

interface Response {
  status: number;
  body: { [key: string]: any };
}

type TeamsfxContext = { [key: string]: any };

export default async function run(
  context: Context,
  req: HttpRequest,
  teamsfxContext: TeamsfxContext
): Promise<Response> {
  context.log("HTTP trigger function processed a request.");

  // Initialize response.
  const res: Response = {
    status: 200,
    body: {},
  };

  // Put an echo into response body.
  res.body.receivedHTTPRequestBody = req.body || "";

  // Prepare access token.
  const accessToken: string = teamsfxContext["AccessToken"];
  if (!accessToken) {
    return {
      status: 400,
      body: {
        error: "No access token was found in request header.",
      },
    };
  }

  const oboAuthConfig: OnBehalfOfCredentialAuthConfig = {
    authorityHost: config.authorityHost,
    clientId: config.clientId,
    tenantId: config.tenantId,
    clientSecret: config.clientSecret,
  };

  let oboCredential: OnBehalfOfUserCredential;
  try {
    oboCredential = new OnBehalfOfUserCredential(accessToken, oboAuthConfig);
  } catch (e) {
    context.log.error(e);
    return {
      status: 500,
      body: {
        error:
          "Failed to construct OnBehalfOfUserCredential using your accessToken. " +
          "Ensure your function app is configured with the right Azure AD App registration.",
      },
    };
  }

  // Query user's information from the access token.
  try {
    const currentUser: UserInfo = await oboCredential.getUserInfo();
    if (currentUser && currentUser.displayName) {
      res.body.userInfoMessage = `User display name is ${currentUser.displayName}.`;
    } else {
      res.body.userInfoMessage = "No user information was found in access token.";
    }
  } catch (e) {
    context.log.error(e);
    return {
      status: 400,
      body: {
        error: "Access token is invalid.",
      },
    };
  }

  // Create a graph client with default scope to access user's Microsoft 365 data after user has consented.
  try {
    // Create an instance of the TokenCredentialAuthenticationProvider by passing the tokenCredential instance and options to the constructor
    const authProvider = new TokenCredentialAuthenticationProvider(oboCredential, {
      scopes: ["https://graph.microsoft.com/.default"],
    });

    // Initialize Graph client instance with authProvider
    const graphClient = Client.initWithMiddleware({
      authProvider: authProvider,
    });

    const profile: any = await graphClient.api("/me/messages").get();
    res.body.graphClientMessage = profile;
  } catch (e) {
    context.log.error(e);
    return {
      status: 500,
      body: {
        error:
          "Failed to retrieve user profile from Microsoft Graph. The application may not be authorized.",
      },
    };
  }

  return res;
}
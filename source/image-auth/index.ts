import { CloudFrontRequestHandler, CloudFrontResponse } from "aws-lambda";
import { CognitoIdentityClient } from "@aws-sdk/client-cognito-identity";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-provider-cognito-identity";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

const STACK_NAME = process.env.STACK_NAME;
const ssm = new SSMClient({ region: "us-east-1" });

export const handler: CloudFrontRequestHandler = async (_evt) => {
  const request = _evt.Records[0].cf.request;
  console.log(request);
  const headers = request.headers;
  console.log(headers);

  if (!headers["authorization"]) {
    return unauthorized();
  }

  const IDENTITY_POOL_ID = (
    await ssm.send(
      new GetParameterCommand({
        Name: `${STACK_NAME}_IDENTITY_POOL_ID`,
      })
    )
  ).Parameter.Value;

  const USER_POOL_ID = (
    await ssm.send(
      new GetParameterCommand({
        Name: `${STACK_NAME}_USER_POOL_ID`,
      })
    )
  ).Parameter.Value;

  const cognitoidentity = new CognitoIdentityClient({
    credentials: fromCognitoIdentityPool({
      client: new CognitoIdentityClient({
        region: IDENTITY_POOL_ID.split(":")[0],
      }),
      identityPoolId: IDENTITY_POOL_ID,
      logins: {
        [USER_POOL_ID]: headers["authorization"][0].value,
      },
    }),
  });

  try {
    const credentials = await cognitoidentity.config.credentials();
    console.log(credentials);
    const identity_ID = credentials.identityId;
    console.log(identity_ID);

    if (request.uri.startsWith("/protected/")) {
      return request;
    }

    if (!request.uri.startsWith(`/private/${identity_ID}`)) {
      return forbidden();
    }
  } catch (e) {
    console.log("error", e);
    return forbidden();
  }

  return request;
};

function unauthorized(): CloudFrontResponse {
  return {
    status: "401",
    statusDescription: "Unauthorized",
    headers: {},
  };
}

function forbidden(): CloudFrontResponse {
  return {
    status: "403",
    statusDescription: "Forbidden",
    headers: {},
  };
}

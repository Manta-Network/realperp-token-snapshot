import { gql, GraphQLClient } from "graphql-request";
import fs from "fs";
import { ethers } from "ethers";
import ABI_ERC20 from "../abis/ERC20.json";
import ABI_Vault from "../abis/Vault.json";
import { JsonRpcProvider } from "ethers";

async function getTokenBalanceSnapshot(
  contract_address: string,
  blocknumber: number,
  client: GraphQLClient
) {
  const final_data: any[] = [];

  const query = gql`
    query GetTokenBalance($id: ID!, $blocknumber: Int!, $first: Int!, $skip: Int!) {
      erc20BalanceWithTimestamps(
        where: { contract_: { id: $id }, blocknumber_lt: $blocknumber, account_: { id_not: null } }
        first: $first
        skip: $skip
      ) {
        account {
          id
        }
        valueExact
        blocknumber
      }
    }
  `;

  let skip = 0;
  const first = 1000;

  while (true) {
    console.log(`Fetching data from ${skip} to ${skip + first}`);

    // Define the variables object
    const variables = {
      id: contract_address,
      blocknumber: blocknumber,
      first: first,
      skip: skip,
    };

    const res = (await client.request(query, variables)) as any;

    const data_ls = res["erc20BalanceWithTimestamps"];

    for (const data of data_ls) {
      final_data.push(data);
    }

    if (data_ls.length < first) {
      break;
    }

    skip += first;
  }

  return final_data;
}

async function getUserOwnedStone(blockNumber: number) {
  const fsRLPAddr = "0x18ae8e9ee384cf9e5159aec454b9e3eb2123ba1c";
  const vaultAddr = "0xEA5C751039e38e1d2C0b8983D4F024e3bc928bc4";
  const stoneAddr = "0xEc901DA9c68E90798BbBb74c11406A32A70652C3";

  const graphClient = new GraphQLClient(
    "https://api.goldsky.com/api/public/project_clnv4qr7e30dv33vpgx7y0f1d/subgraphs/pacific-mainnet-realperp-token/2.0.0/gn"
  );

  const data = await getTokenBalanceSnapshot(fsRLPAddr, blockNumber, graphClient);

  const final_data: Record<string, { value: string; blocknumber: string; stoneAmount?: string }> =
    {};
  for (const data_item of data) {
    const account = data_item["account"]["id"];
    const value = data_item["valueExact"];
    const blocknumber = data_item["blocknumber"];

    if (!(account in final_data)) {
      final_data[account] = { value: value, blocknumber: blocknumber };
    } else {
      if (blocknumber > Number(final_data[account]["blocknumber"])) {
        final_data[account] = { value: value, blocknumber: blocknumber };
      }
    }
  }

  const provider = new JsonRpcProvider("https://pacific-rpc.manta.network/http");

  let fsRLP_totalSupply: string;
  let stonePoolAmount: string;

  {
    let iface = new ethers.Interface(ABI_ERC20);
    const action = "totalSupply";
    const params: any[] = [];
    const data = iface.encodeFunctionData(action, params);

    const response = await provider.call({
      to: fsRLPAddr, // pool address
      from: "0x8425a653613D45b381Af9fc83b925379b725c9bF",
      data: data,
      value: "0",
      chainId: (await provider.getNetwork()).chainId,
      blockTag: BigInt(blockNumber),
    });

    fsRLP_totalSupply = iface.decodeFunctionResult(action, response).toString();
  }
  {
    let iface = new ethers.Interface(ABI_Vault);
    const action = "poolAmounts";
    const params: any[] = [stoneAddr];
    const data = iface.encodeFunctionData(action, params);

    const response = await provider.call({
      to: vaultAddr, // pool address
      from: "0x8425a653613D45b381Af9fc83b925379b725c9bF",
      data: data,
      value: "0",
      chainId: (await provider.getNetwork()).chainId,
      blockTag: BigInt(blockNumber),
    });

    stonePoolAmount = iface.decodeFunctionResult(action, response).toString();
  }

  // loop account
  for (const account in final_data) {
    const value = final_data[account]["value"];

    final_data[account]["stoneAmount"] = ethers.formatUnits(
      ((BigInt(value) * BigInt(stonePoolAmount)) / BigInt(fsRLP_totalSupply)).toString(),
      18
    );
  }
}

async function main() {
  const data = await getUserOwnedStone(2026885);
}

main();

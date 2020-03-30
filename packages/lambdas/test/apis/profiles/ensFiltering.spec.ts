import { getOwnedENS } from "../../../src/apis/profiles/ensFiltering";
import { DEFAULT_ENS_OWNER_PROVIDER_URL } from "../../../src/Environment";

describe("Ensure ENS filtering work as expected", () => {
  it(`Ensure Address case is ignored when retrieving ENS`, async () => {
    const originalAddress = "0x079BED9C31CB772c4C156F86E1CFf15bf751ADd0";

    const namesOriginal = await getOwnedENS(DEFAULT_ENS_OWNER_PROVIDER_URL, originalAddress);
    expect(namesOriginal.length).toBeGreaterThanOrEqual(1);

    const namesUpper = await getOwnedENS(DEFAULT_ENS_OWNER_PROVIDER_URL, originalAddress.toUpperCase());
    expect(namesUpper).toEqual(namesOriginal);

    const namesLower = await getOwnedENS(DEFAULT_ENS_OWNER_PROVIDER_URL, originalAddress.toLowerCase());
    expect(namesLower).toEqual(namesOriginal);
  });
});

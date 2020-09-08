import { filterENS } from "../../../src/apis/profiles/ensFiltering";
import { DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN } from "../../../src/Environment";

describe("Ensure ENS filtering work as expected", () => {

    it(`Ensure Address case is ignored when retrieving ENS`, async () => {
        const originalAddress = '0x079BED9C31CB772c4C156F86E1CFf15bf751ADd0'

        const namesOriginal = await filterENS(DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN, originalAddress, ["marcosnc", "invalid_name"])
        expect(namesOriginal.length).toEqual(1)

        const namesUpper = await filterENS(DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN, originalAddress.toUpperCase(), ["marcosnc", "invalid_name"])
        expect(namesUpper).toEqual(namesOriginal)

        const namesLower = await filterENS(DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN, originalAddress.toLowerCase(), ["marcosnc", "invalid_name"])
        expect(namesLower).toEqual(namesOriginal)
    }, 100000);

});

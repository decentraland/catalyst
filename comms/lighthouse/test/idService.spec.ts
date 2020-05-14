import { IdService } from "../src/idService";

describe("id service generation", function () {
  let idService: IdService;

  beforeEach(() => {
    idService = new IdService();
  });

  it("generates an id", () => {
    expect(idService.nextId()).toBe("00");
  });

  it("generates secuential id", () => {
    idService.nextId();
    expect(idService.nextId()).toBe("01");
  });

  it("can cycle to the next character in the id", () => {
    for(let i = 0; i < idService.config.alphabet.length; i++) {
      idService.nextId();
    }

    expect(idService.nextId()).toBe("10");
  });

  it("can cycle to the first id after the last id", () => {
    for(let i = 0; i < idService.config.alphabet.length * idService.config.alphabet.length; i++) {
      idService.nextId();
    }

    expect(idService.nextId()).toBe("00");
  });
});

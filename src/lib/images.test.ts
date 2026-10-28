import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWikimedia } from "./images";

const reply = (status: number) => new Response("{}", { status });

describe("fetchWikimedia", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tries again while Wikimedia is busy, and returns the first good answer", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply(503)).mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(reply(200));
    vi.stubGlobal("fetch", fetch);
    const response = await fetchWikimedia("https://commons.wikimedia.org/w/api.php", {}, [0, 0]);
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("says the service is busy after the last try", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(503)));
    await expect(fetchWikimedia("https://commons.wikimedia.org/w/api.php", {}, [0, 0])).rejects.toThrow("busy or down (error 503)");
  });

  it("does not try again for a status that will not change", async () => {
    const fetch = vi.fn().mockResolvedValue(reply(404));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchWikimedia("https://commons.wikimedia.org/w/api.php", {}, [0, 0])).rejects.toThrow("returned 404");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

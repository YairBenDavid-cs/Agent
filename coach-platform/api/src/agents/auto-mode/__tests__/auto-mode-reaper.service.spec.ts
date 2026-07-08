import { AutoModeReaperService } from '../auto-mode-reaper.service';

function setup() {
  const locks = { reapStale: jest.fn(() => Promise.resolve(0)) };
  const service = new AutoModeReaperService(locks as never);
  return { service, locks };
}

describe('AutoModeReaperService.sweep', () => {
  it('calls reapStale with the sweep limit of 50', async () => {
    const { service, locks } = setup();

    await service.sweep();

    expect(locks.reapStale).toHaveBeenCalledWith(50);
  });

  it('does not throw/reject when reapStale rejects (error is swallowed and only logged)', async () => {
    const { service, locks } = setup();
    locks.reapStale.mockRejectedValueOnce(new Error('db down'));

    await expect(service.sweep()).resolves.toBeUndefined();
  });
});

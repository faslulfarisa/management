import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CampaignService } from './campaign.service';

describe('CampaignService — validation and cost/conversion stats', () => {
  let db: { query: jest.Mock };
  let service: CampaignService;

  beforeEach(() => {
    db = { query: jest.fn() };
    service = new CampaignService(db as any);
  });

  it('rejects updating a campaign to an invalid status', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'camp-1', tenant_id: 't1' }] }); // findOne lookup inside update()

    await expect(service.update('camp-1', 't1', 'user-1', { status: 'not_a_real_status' } as any)).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when the campaign does not exist', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await expect(service.findOne('missing', 't1')).rejects.toThrow(NotFoundException);
  });

  it('defaults campaign_type to "other" and actual_spend to 0 on create', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'camp-1', name: 'Spring Drive', campaign_type: 'other', actual_spend: 0 }] });

    await service.create('t1', 'user-1', { name: 'Spring Drive' });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO recruitment_campaigns'),
      ['t1', 'Spring Drive', 'other', [], null, null, null, 0, null, 'user-1'],
    );
  });

  it('computes conversion_rate and cost_per_hire from applications linked to the campaign', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'camp-1', actual_spend: '5000' }] }) // findOne
      .mockResolvedValueOnce({ rows: [{ total_applications: '20', shortlisted: '8', rejected: '10', hired: '2' }] }); // stats aggregate

    const stats = await service.getStats('camp-1', 't1');

    expect(stats.total_applications).toBe(20);
    expect(stats.conversion_rate).toBe(10); // 2/20 * 100
    expect(stats.cost_per_hire).toBe(2500); // 5000 / 2
  });

  it('returns a null cost_per_hire when there are no hires yet (avoids dividing by zero)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'camp-1', actual_spend: '5000' }] })
      .mockResolvedValueOnce({ rows: [{ total_applications: '6', shortlisted: '2', rejected: '1', hired: '0' }] });

    const stats = await service.getStats('camp-1', 't1');

    expect(stats.cost_per_hire).toBeNull();
    expect(stats.conversion_rate).toBe(0);
  });
});

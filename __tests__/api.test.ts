import { createMocks } from 'node-mocks-http';
import handler from '../pages/api/fraud-stream';

jest.mock('@upstash/redis', () => {
  return {
    Redis: jest.fn().mockImplementation(() => ({
      lrange: jest.fn().mockResolvedValue([
        JSON.stringify({
          time: "10:00:00",
          sender: "C12345",
          receiver: "M67890",
          type: "TRANSFER",
          amount: 5000,
          score: 0.85,
          risk: "HIGH"
        })
      ]),
      get: jest.fn().mockResolvedValue(100)
    }))
  };
});

describe('Kiểm thử API Fraud Stream', () => {
  it('Phải trả về đúng Header định dạng SSE (text/event-stream)', async () => {
    const { req, res } = createMocks({
      method: 'GET',
    });

    await handler(req, res as any);

    expect(res._getStatusCode()).toBe(200);
    
    expect(res._getHeaders()['content-type']).toBe('text/event-stream');
  });
});
import type { NextApiRequest, NextApiResponse } from 'next';
import { Redis } from '@upstash/redis';

// Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // ==========================================
  // 1. SSE HEADERS (CHUẨN)
  // ==========================================
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Content-Encoding', 'none');

  // 👇 thêm retry cho client
  res.write(`retry: 3000\n\n`);

  // ==========================================
  // 2. SAFE PARSE
  // ==========================================
  const safeParse = (item: any) => {
    try {
      return typeof item === 'string' ? JSON.parse(item) : item;
    } catch {
      return null;
    }
  };

  // ==========================================
  // 3. SEND DATA
  // ==========================================
  const sendUpdate = async () => {
    try {
      const rawFrauds = await redis.lrange('momo_fraud_list', 0, 49);
      const totalCount = await redis.get('total_fraud_count') || 0;

      let latestFrauds = rawFrauds
        .map(safeParse)
        .filter(Boolean);

      // ==========================================
      // 🔥 FIX QUAN TRỌNG: Đồng bộ Threshold với PySpark
      // ==========================================
      latestFrauds = latestFrauds.map((f: any) => {
        // Lấy score chuẩn
        const rawScore = f.score !== undefined ? Number(f.score) : (f.risk ? Number(f.risk) / 100 : 0);
        
        // Ưu tiên dùng risk text ("HIGH", "MEDIUM", "LOW") từ PySpark gửi lên. 
        // Nếu không có hoặc là dữ liệu cũ (dạng số), mới dùng Fallback với mốc chuẩn (0.7 và 0.4)
        let riskLabel = f.risk;
        if (typeof riskLabel !== 'string' || !['HIGH', 'MEDIUM', 'LOW'].includes(riskLabel)) {
            if (rawScore > 0.7) riskLabel = 'HIGH';
            else if (rawScore > 0.4) riskLabel = 'MEDIUM';
            else riskLabel = 'LOW';
        }

        return {
          time: f.time,
          sender: f.sender,
          receiver: f.receiver,
          type: f.type,
          amount: f.amount,
          score: rawScore,
          risk: riskLabel, 
        };
      });

      // ==========================================
      // 🔥 SORT THEO SCORE (Khôi phục đoạn bị mất)
      // ==========================================
      latestFrauds.sort((a: any, b: any) => b.score - a.score);

      const payload = {
        latestFrauds,
        totalCount: Number(totalCount),
        serverTime: new Date().toLocaleTimeString(),
      };

      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (error) {
      console.error("❌ Upstash error:", error);
    }
  };

  // ==========================================
  // 4. HEARTBEAT (TRÁNH TIMEOUT)
  // ==========================================
  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`);
  }, 10000);

  // ==========================================
  // 5. START STREAM
  // ==========================================
  await sendUpdate();
  const interval = setInterval(sendUpdate, 3000);

  // ==========================================
  // 6. CLEANUP
  // ==========================================
  req.on('close', () => {
    clearInterval(interval);
    clearInterval(heartbeat);
    res.end();
    console.log("🔌 Client disconnected");
  });
}
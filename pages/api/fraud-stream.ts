import type { NextApiRequest, NextApiResponse } from 'next';
import { Redis } from '@upstash/redis';

// Khởi tạo Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 1. Thiết lập các Header bắt buộc cho Server-Sent Events (SSE)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Content-Encoding', 'none'); // Tránh lỗi nén dữ liệu làm delay SSE

  // Hàm gửi dữ liệu từ Redis về Client
  const sendUpdate = async () => {
    try {
      // Lấy 15 ca gian lận mới nhất từ list (khớp với key 'momo_fraud_list' ở Databricks)
      const rawFrauds = await redis.lrange('momo_fraud_list', 0, 14);
      
      // Lấy tổng số ca gian lận để hiển thị con số tổng quát
      const totalCount = await redis.get('total_fraud_count') || 0;

      // Parse dữ liệu từ chuỗi JSON (vì Databricks đẩy lên dạng JSON string)
      const latestFrauds = rawFrauds.map((item: any) => 
        typeof item === 'string' ? JSON.parse(item) : item
      );

      const payload = {
        latestFrauds,
        totalCount: Number(totalCount),
        serverTime: new Date().toLocaleTimeString()
      };

      // Gửi dữ liệu theo định dạng chuẩn SSE: "data: <string>\n\n"
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (error) {
      console.error("❌ Lỗi khi đọc Upstash:", error);
    }
  };

  // 2. Gửi ngay lập tức khi client vừa kết nối
  await sendUpdate();

  // 3. Thiết lập chu kỳ cập nhật (mỗi 3 giây quét Redis một lần)
  const interval = setInterval(sendUpdate, 3000);

  // 4. Khi người dùng đóng tab hoặc ngắt kết nối
  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
}
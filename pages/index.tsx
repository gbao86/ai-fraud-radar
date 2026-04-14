'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler, ScatterController,
} from 'chart.js';
import { Line, Bar, Doughnut, Scatter } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler, ScatterController
);

// --- HELPERS ---
function fmtVND(n: number): string {
  return (n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}

const TYPES = ['CASH_OUT', 'TRANSFER', 'DEBIT', 'CASH_IN'] as const;
type TxType = typeof TYPES[number];

interface FraudRecord {
  time: string; sender: string; receiver: string;
  type: TxType; amount: number; balance: number; risk: number;
}

// --- STATIC DATA (Đánh giá mô hình - Giữ nguyên vì đây là hằng số sau khi train) ---
const FEATURE_LABELS = ['amount','oldbalanceOrg','newbalanceOrig','oldbalanceDest','newbalanceDest','type_CASHOUT','step','isFlaggedFraud'];
const FEATURE_VALS   = [0.38, 0.22, 0.18, 0.09, 0.07, 0.03, 0.02, 0.01];
const ROC_FPR = [0,0.01,0.02,0.04,0.06,0.08,0.10,0.15,0.20,0.30,0.40,0.50,0.60,0.80,1.0];
const ROC_TPR = [0,0.72,0.84,0.90,0.93,0.95,0.96,0.97,0.98,0.988,0.992,0.995,0.997,0.999,1.0];

const BASE_OPTS = {
  maintainAspectRatio: false as const,
  plugins: { legend: { display: false } },
  scales: {
    y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { size: 11 } } },
    x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } },
  },
};

export default function FraudRadarDashboard() {
  const [mounted, setMounted] = useState(false);
  const [fraudLog, setFraudLog] = useState<FraudRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [clock, setClock] = useState('--:--:--');
  const [status, setStatus] = useState<'CONNECTING' | 'LIVE' | 'OFFLINE'>('CONNECTING');

  useEffect(() => {
    setMounted(true);
  }, []);

  // KẾT NỐI SSE (Lấy dữ liệu thật từ Upstash)
  useEffect(() => {
    if (!mounted) return;
    let es: EventSource;

    const connect = () => {
      es = new EventSource('/api/fraud-stream');
      
      es.onmessage = (e) => {
        try {
          const p = JSON.parse(e.data);
          // Cập nhật danh sách từ Redis
          if (p.latestFrauds) setFraudLog(p.latestFrauds);
          // Cập nhật tổng số ca từ Redis
          if (p.totalCount !== undefined) setTotalCount(p.totalCount);
          setStatus('LIVE');
        } catch (err) {
          console.error("Lỗi parse dữ liệu:", err);
        }
      };

      es.onerror = () => {
        setStatus('OFFLINE');
        es.close();
        setTimeout(connect, 5000); // Thử kết nối lại sau 5s
      };
    };

    connect();
    return () => es?.close();
  }, [mounted]);

  // Đồng hồ hệ thống
  useEffect(() => {
    if (!mounted) return;
    const t = setInterval(() => setClock(new Date().toTimeString().slice(0, 8)), 1000);
    return () => clearInterval(t);
  }, [mounted]);

  // --- DỮ LIỆU BIỂU ĐỒ (Dựa hoàn toàn vào fraudLog từ Redis) ---
  const lineData = useMemo(() => ({
    labels: fraudLog.map(d => d.time).reverse(),
    datasets: [{
      label: 'Giá trị rủi ro',
      data: fraudLog.map(d => d.amount).reverse(),
      borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)',
      fill: true, tension: 0.4, pointRadius: 4, borderWidth: 2,
    }],
  }), [fraudLog]);

  const donutData = useMemo(() => {
    const counts: any = { CASH_OUT: 0, TRANSFER: 0, DEBIT: 0, CASH_IN: 0 };
    fraudLog.forEach(d => { if(counts[d.type] !== undefined) counts[d.type]++ });
    return {
      labels: Object.keys(counts),
      datasets: [{
        data: Object.values(counts),
        backgroundColor: ['#ef4444','#3b82f6','#f59e0b','#10b981'],
        borderWidth: 0,
      }],
    };
  }, [fraudLog]);

  if (!mounted) return <div style={{ background: '#08090f', minHeight: '100vh' }} />;

  return (
    <div style={{ background: '#08090f', minHeight: '100vh', color: '#e2e8f0', padding: 20, fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        
        {/* HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: 20, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900 }}>AI FRAUD <span style={{ color: '#ef4444' }}>RADAR</span> REAL-TIME</h1>
            <p style={{ color: '#64748b', fontSize: 12 }}>Data source: Upstash Redis (Cloud) | Model: Random Forest</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ 
              padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 'bold',
              background: status === 'LIVE' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              color: status === 'LIVE' ? '#10b981' : '#ef4444',
              border: `1px solid ${status === 'LIVE' ? '#10b981' : '#ef4444'}`
            }}>
              ● {status}
            </span>
            <p style={{ marginTop: 8, fontFamily: 'monospace' }}>{clock}</p>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 15, marginBottom: 20 }}>
          <div className="card">
            <p style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase' }}>Tổng ca gian lận</p>
            <h2 style={{ fontSize: 32, color: '#ef4444' }}>{totalCount}</h2>
          </div>
          <div className="card">
            <p style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase' }}>Trạng thái Spark</p>
            <h2 style={{ fontSize: 24, color: '#3b82f6' }}>STREAMING</h2>
          </div>
          <div className="card">
            <p style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase' }}>Độ chính xác AI</p>
            <h2 style={{ fontSize: 24, color: '#10b981' }}>98.42%</h2>
          </div>
          <div className="card">
            <p style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase' }}>Middleware</p>
            <h2 style={{ fontSize: 24, color: '#f59e0b' }}>KAFKA/REDIS</h2>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 20 }}>
          <div className="card" style={{ height: 350 }}>
            <p style={{ marginBottom: 15, fontWeight: 'bold' }}>Dòng tiền rủi ro (Real-time)</p>
            <Line data={lineData} options={BASE_OPTS} />
          </div>
          <div className="card" style={{ height: 350 }}>
            <p style={{ marginBottom: 15, fontWeight: 'bold' }}>Phân loại hình thức</p>
            <Doughnut data={donutData} options={{ cutout: '70%', plugins: { legend: { display: false } } }} />
          </div>
        </div>

        {/* TABLE DỮ LIỆU THẬT */}
        <div className="card">
          <p style={{ color: '#ef4444', fontWeight: 'bold', marginBottom: 15 }}>🔴 NHẬT KÝ CẢNH BÁO TỪ UPSTASH CLOUD</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', textAlign: 'left', color: '#64748b', fontSize: 11 }}>
                  <th style={{ padding: 10 }}>THỜI GIAN</th>
                  <th style={{ padding: 10 }}>SENDER</th>
                  <th style={{ padding: 10 }}>HÌNH THỨC</th>
                  <th style={{ padding: 10, textAlign: 'right' }}>SỐ TIỀN</th>
                  <th style={{ padding: 10, textAlign: 'center' }}>RỦI RO</th>
                </tr>
              </thead>
              <tbody>
                {fraudLog.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Đang đợi dữ liệu từ Spark Pipeline...</td></tr>
                ) : (
                  fraudLog.map((f, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: 10, color: '#ef4444', fontFamily: 'monospace' }}>{f.time}</td>
                      <td style={{ padding: 10 }}>{f.sender}</td>
                      <td style={{ padding: 10 }}><span style={{ background: '#1e293b', padding: '2px 8px', borderRadius: 4, fontSize: 10 }}>{f.type}</span></td>
                      <td style={{ padding: 10, textAlign: 'right', fontWeight: 'bold', color: '#f59e0b' }}>{fmtVND(f.amount)}</td>
                      <td style={{ padding: 10, textAlign: 'center' }}>
                        <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{f.risk || 98}%</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
      <style jsx>{`
        .card { background: #141622; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; }
      `}</style>
    </div>
  );
}
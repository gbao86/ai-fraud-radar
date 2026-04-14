'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler, ScatterController,
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler, ScatterController
);

// =======================
// FORMAT TIỀN
// =======================
function fmtCurrency(n: number): string {
  if (!n) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2 
  }).format(n);
}

// =======================
// TYPES & INTERFACES
// =======================
const TYPES = ['CASH_OUT', 'TRANSFER', 'DEBIT', 'CASH_IN'] as const;
type TxType = typeof TYPES[number];

interface FraudRecord {
  time: string; 
  sender: string; 
  receiver: string;
  type: TxType; 
  amount: number; 
  balance: number; 
  score: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
}

// =======================
// STYLE RISK BADGES
// =======================
function getRiskStyle(risk: string) {
  switch (risk) {
    case 'HIGH':
      return { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: '🔴 HIGH' };
    case 'MEDIUM':
      return { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: '🟠 MED' };
    default:
      return { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: '🟢 SAFE' };
  }
}

// =======================
// CHART OPTIONS
// =======================
const BASE_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { size: 11 } } },
    x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } },
  },
};

// =======================
// MAIN COMPONENT
// =======================
export default function FraudRadarDashboard() {
  const [mounted, setMounted] = useState(false);
  const [fraudLog, setFraudLog] = useState<FraudRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [clock, setClock] = useState('--:--:--');
  const [status, setStatus] = useState<'CONNECTING' | 'LIVE' | 'OFFLINE'>('CONNECTING');

  useEffect(() => { setMounted(true); }, []);

  // =======================
  // SSE CONNECTION
  // =======================
  useEffect(() => {
    if (!mounted) return;
    let es: EventSource;
    const connect = () => {
      es = new EventSource('/api/fraud-stream');
      es.onmessage = (e) => {
        try {
          const p = JSON.parse(e.data);
          if (p.latestFrauds) {
            // Sắp xếp mặc định cho Bảng: Score cao xếp trước
            const sorted = p.latestFrauds.sort((a: FraudRecord, b: FraudRecord) => b.score - a.score);
            setFraudLog(sorted);
          }
          if (p.totalCount !== undefined) setTotalCount(p.totalCount);
          setStatus('LIVE');
        } catch (err) { console.error("Lỗi parse:", err); }
      };
      es.onerror = () => {
        setStatus('OFFLINE');
        es.close();
        setTimeout(connect, 5000);
      };
    };
    connect();
    return () => es?.close();
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const t = setInterval(() => setClock(new Date().toTimeString().slice(0, 8)), 1000);
    return () => clearInterval(t);
  }, [mounted]);

  // =======================
  // CHART DATA (ĐÃ FIX LỖI TIME)
  // =======================
  
  // 🌟 Tách riêng một mảng được xếp theo thứ tự Thời gian (Cũ -> Mới) để vẽ Line Chart chuẩn
  const timeSortedLog = useMemo(() => {
    return [...fraudLog].sort((a, b) => a.time.localeCompare(b.time));
  }, [fraudLog]);

  const lineData = useMemo(() => ({
    labels: timeSortedLog.map(d => d.time), // Không cần .reverse() nữa
    datasets: [{
      label: 'Risk Score (%)',
      data: timeSortedLog.map(d => (d.score * 100).toFixed(2)),
      borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)',
      fill: true, tension: 0.4, pointRadius: 4, borderWidth: 2,
    }],
  }), [timeSortedLog]);

  const amountLineData = useMemo(() => ({
    labels: timeSortedLog.map(d => d.time),
    datasets: [{
      label: 'Amount (USD)',
      data: timeSortedLog.map(d => d.amount),
      borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)',
      fill: true, tension: 0.4, pointRadius: 4, borderWidth: 2,
    }],
  }), [timeSortedLog]);

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
    <div suppressHydrationWarning style={{ background: '#08090f', minHeight: '100vh', color: '#e2e8f0', padding: 20, fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        
        {/* HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: 20, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900 }}>AI FRAUD <span style={{ color: '#ef4444' }}>RADAR</span> REAL-TIME</h1>
            <p style={{ color: '#64748b', fontSize: 12 }}>Data source: Upstash Redis (Cloud) | Model: Gradient Boosted Trees (GBT)</p>
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
            <p className="card-title">Tổng ca gian lận</p>
            <h2 style={{ fontSize: 32, color: '#ef4444' }}>{totalCount}</h2>
          </div>
          <div className="card">
            <p className="card-title">Trạng thái Spark</p>
            <h2 style={{ fontSize: 24, color: '#3b82f6' }}>STREAMING</h2>
          </div>
          <div className="card">
            <p className="card-title">Độ chính xác AI</p>
            <h2 style={{ fontSize: 24, color: '#10b981' }}>99.40%</h2>
          </div>
          <div className="card">
            <p className="card-title">Middleware</p>
            <h2 style={{ fontSize: 24, color: '#f59e0b' }}>KAFKA/REDIS</h2>
          </div>
        </div>

        {/* CHARTS LAYOUT */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 20 }}>
          
          {/* CỘT TRÁI */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card" style={{ height: 280, display: 'flex', flexDirection: 'column' }}>
              <p style={{ marginBottom: 15, fontWeight: 'bold' }}>Biến động rủi ro (Risk Score)</p>
              <div style={{ flexGrow: 1, position: 'relative' }}>
                 <Line data={lineData} options={BASE_OPTS} />
              </div>
            </div>
            
            <div className="card" style={{ height: 280, display: 'flex', flexDirection: 'column' }}>
              <p style={{ marginBottom: 15, fontWeight: 'bold' }}>Dòng tiền giao dịch (Amount - USD)</p>
              <div style={{ flexGrow: 1, position: 'relative' }}>
                 <Line data={amountLineData} options={BASE_OPTS} />
              </div>
            </div>
          </div>

          {/* CỘT PHẢI */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <p style={{ marginBottom: 15, fontWeight: 'bold' }}>Phân loại hình thức</p>
            <div style={{ flexGrow: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               <Doughnut 
                 data={donutData} 
                 options={{ 
                   ...BASE_OPTS, 
                   cutout: '70%',
                   scales: { x: { display: false }, y: { display: false } } 
                 }} 
               />
            </div>
          </div>

        </div>

        {/* TABLE */}
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
                  <th style={{ padding: 10, textAlign: 'center' }}>ĐÁNH GIÁ RỦI RO</th>
                </tr>
              </thead>
              <tbody>
                {fraudLog.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Đang đợi dữ liệu...</td></tr>
                ) : (
                  fraudLog.map((f, i) => {
                    const r = getRiskStyle(f.risk);
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: 10, color: '#ef4444', fontFamily: 'monospace' }}>{f.time}</td>
                        <td style={{ padding: 10 }}>{f.sender}</td>
                        <td style={{ padding: 10 }}><span style={{ background: '#1e293b', padding: '2px 8px', borderRadius: 4, fontSize: 10 }}>{f.type}</span></td>
                        <td style={{ padding: 10, textAlign: 'right', fontWeight: 'bold', color: '#f59e0b' }}>{fmtCurrency(f.amount)}</td>
                        <td style={{ padding: 10, textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <span style={{ 
                              color: r.color, 
                              background: r.bg, 
                              padding: '2px 8px', 
                              borderRadius: 4, 
                              fontSize: 10, 
                              fontWeight: 'bold' 
                            }}>
                              {r.label}
                            </span>
                            <span style={{ color: '#64748b', fontSize: 11 }}>{(f.score * 100).toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
      <style jsx>{`
        .card { background: #141622; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; overflow: hidden; }
        .card-title { color: #64748b; fontSize: 10px; text-transform: uppercase; margin-bottom: 5px; }
      `}</style>
    </div>
  );
}
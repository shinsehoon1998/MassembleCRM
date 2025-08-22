import { useEffect, useRef } from "react";

interface StatusData {
  status: string;
  count: number;
}

interface StatusChartProps {
  data: StatusData[];
}

export default function StatusChart({ data }: StatusChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    const loadChart = async () => {
      // Dynamically import Chart.js
      const { Chart, registerables } = await import('chart.js');
      Chart.register(...registerables);

      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;

      // Destroy existing chart
      if (chartRef.current) {
        chartRef.current.destroy();
      }

      const statusColors: Record<string, string> = {
        '인텍': '#ffd93d',
        '수수': '#6bcf7f', 
        '접수': '#4a90e2',
        '작업': '#f5a623',
        '완료': '#7ed321'
      };

      chartRef.current = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: data.map(item => item.status),
          datasets: [{
            data: data.map(item => item.count),
            backgroundColor: data.map(item => statusColors[item.status] || '#gray'),
            borderWidth: 0,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          }
        }
      });
    };

    loadChart();

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [data]);

  const statusColors: Record<string, string> = {
    '인텍': '#ffd93d',
    '수수': '#6bcf7f', 
    '접수': '#4a90e2',
    '작업': '#f5a623',
    '완료': '#7ed321'
  };

  return (
    <div className="space-y-4">
      <div className="relative h-64">
        <canvas ref={canvasRef} data-testid="status-chart"></canvas>
      </div>
      <div className="space-y-2">
        {data.map((item) => (
          <div key={item.status} className="flex items-center justify-between text-sm">
            <div className="flex items-center">
              <div 
                className="w-3 h-3 rounded-full mr-2" 
                style={{ backgroundColor: statusColors[item.status] }}
              ></div>
              <span>{item.status}</span>
            </div>
            <span className="font-medium">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

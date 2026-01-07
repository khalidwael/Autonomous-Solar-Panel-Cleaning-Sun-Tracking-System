import React, { useState, useEffect, useRef } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { 
  Sun, Settings, Power, RotateCcw, ArrowRight, ArrowLeft, 
  Activity, AlertTriangle, Zap, CheckCircle2 
} from 'lucide-react';
import { cn } from './lib/utils';

// --- Components ---
//---hearachyy components
const Card = ({ children, className }) => (
  <div className={cn("bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-sm", className)}>
    {children}
  </div>
);

const Button = ({ children, onClick, variant = 'primary', disabled, className }) => {
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20",
    secondary: "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700",
    danger: "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20",
    success: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20",
  };
  
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-4 py-2 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2",
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
};

// --- Main App ---


export default function App() {
  const [port, setPort] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [reader, setReader] = useState(null);
  const [writer, setWriter] = useState(null);
  
  // Telemetry State
  const [data, setData] = useState([]);
  const [currentVals, setCurrentVals] = useState({ LDR_L: 0, LDR_R: 0, Manual: false, LimitL: 0, LimitR: 0 });
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  // Connection Handler
  const connectSerial = async () => {
    try {
      if (!navigator.serial) {
        alert("Web Serial API not supported in this browser. Please use Chrome or Edge.");
        return;
      }
      
      const newPort = await navigator.serial.requestPort();
      await newPort.open({ baudRate: 9600 });
      
      const textEncoder = new TextEncoderStream();
      const writableStreamClosed = textEncoder.readable.pipeTo(newPort.writable);
      const writer = textEncoder.writable.getWriter();
      
      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = newPort.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();

      setPort(newPort);
      setReader(reader);
      setWriter(writer);
      setIsConnected(true);
      
      readLoop(reader);
    } catch (err) {
      console.error("Serial Connection Error:", err);
      if (err.name !== 'NotFoundError') alert(`Failed to connect: ${err.message}`);
    }
  };

  const disconnectSerial = async () => {
    if (writer) {
      await writer.close();
      setWriter(null);
    }
    if (reader) {
      await reader.cancel();
      setReader(null);
    }
    if (port) {
      await port.close();
      setPort(null);
    }
    setIsConnected(false);
  };

  // Heartbeat Effect
  useEffect(() => {
    let interval;
    if (isConnected && writer) {
      interval = setInterval(() => {
        sendCommand("HEARTBEAT");
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isConnected, writer]);

  const readLoop = async (reader) => {
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line
        
        for (const line of lines) {
          try {
            const cleanLine = line.trim();
            if (cleanLine.startsWith('{') && cleanLine.endsWith('}')) {
              const json = JSON.parse(cleanLine);
              updateTelemetry(json);
            }
          } catch (e) {
            console.warn("Parse Error:", e);
          }
        }
      }
    } catch (err) {
      console.error("Read Error:", err);
      setIsConnected(false);
    }
  };

  const [logs, setLogs] = useState([]);

  // ... (connection logic)

  const updateTelemetry = (json) => {
    // Handle Log Messages
    if (json.Log) {
      setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${json.Log}`, ...prev].slice(0, 10)); // Keep last 10 logs
      return;
    }

    setCurrentVals(prev => ({ ...prev, ...json }));
    setLastUpdate(Date.now());
    
    if (json.LDR_L !== undefined) {
      setData(prevData => {
        const newData = [...prevData, { 
          time: new Date().toLocaleTimeString(), 
          LDR_L: json.LDR_L, 
          LDR_R: json.LDR_R 
        }];
        if (newData.length > 50) return newData.slice(-50); 
        return newData;
      });
    }
  };

  const sendCommand = async (cmd) => {
    if (!writer) return;
    try {
      await writer.write(cmd + "\n");
    } catch (err) {
      console.error("Write Error:", err);
    }
  };

  // --- Render ---

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
              Solar Tracking Command Center
            </h1>
            <p className="text-slate-400 text-sm mt-1">Live Monitoring & Control System</p>
          </div>
          
          <div className="flex items-center gap-3">
             <div className={cn("px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 border", 
               isConnected ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20")}>
               <div className={cn("w-2 h-2 rounded-full", isConnected ? "bg-emerald-400 animate-pulse" : "bg-red-400")} />
               {isConnected ? "System Online" : "Disconnected"}
             </div>
             
             {!isConnected ? (
               <Button onClick={connectSerial} className="bg-blue-600">
                 <Zap className="w-4 h-4" /> Connect Device
               </Button>
             ) : (
               <Button onClick={disconnectSerial} variant="secondary">
                 <Power className="w-4 h-4" /> Disconnect
               </Button>
             )}
          </div>
        </header>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Status & Controls */}
          <div className="space-y-6 lg:col-span-1">
            
            {/* System Status Card */}
            <Card className="space-y-4">
               <div className="flex items-center justify-between">
                 <h2 className="text-lg font-semibold flex items-center gap-2">
                   <Activity className="w-5 h-5 text-blue-400" /> Sensor Status
                 </h2>
                 <span className="text-xs text-slate-500">
                   {(Date.now() - lastUpdate) > 2000 ? "Signal Lost" : "Live"}
                 </span>
               </div>
               
               <div className="grid grid-cols-2 gap-4">
                 <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
                    <span className="text-slate-400 text-xs uppercase">LDR Left</span>
                    <div className="text-2xl font-mono font-bold text-yellow-400 mt-1">{currentVals.LDR_L}</div>
                 </div>
                 <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
                    <span className="text-slate-400 text-xs uppercase">LDR Right</span>
                    <div className="text-2xl font-mono font-bold text-yellow-400 mt-1">{currentVals.LDR_R}</div>
                 </div>
               </div>
               
               <div className="pt-2 border-t border-slate-800">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-400">Difference</span>
                    <span className={cn("font-mono font-bold", Math.abs(currentVals.LDR_L - currentVals.LDR_R) > 45 ? "text-red-400" : "text-emerald-400")}>
                      {currentVals.LDR_L - currentVals.LDR_R}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full mt-2 overflow-hidden">
                    <div 
                       className="bg-blue-500 h-full transition-all duration-300"
                       style={{ width: `${Math.min(Math.abs(currentVals.LDR_L - currentVals.LDR_R), 100)}%` }} 
                    />
                  </div>
               </div>
            </Card>

            {/* Control Panel */}
            <Card className="space-y-6 relative overflow-hidden">
               {/* Decorative background glow */}
               <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -z-10" />
               
               <div className="flex items-center justify-between">
                 <h2 className="text-lg font-semibold flex items-center gap-2">
                   <Settings className="w-5 h-5 text-purple-400" /> Controls
                 </h2>
                 <span className={cn("text-xs font-bold px-2 py-1 rounded bg-slate-800 border border-slate-700", currentVals.Manual ? "text-amber-400" : "text-blue-400")}>
                    {currentVals.Manual ? "MANUAL MODE" : "AUTO TRACKING"}
                 </span>
               </div>
               
            {/* Debug Info */}
               <div className="text-xs text-slate-500 flex justify-between bg-slate-900/50 p-2 rounded">
                 <span>Diff: {currentVals.Diff || 0}</span>
                 <span>Action: {currentVals.Action || "Unknown"}</span>
               </div>
               

               {/* Logs View */ }
               <div className="bg-slate-950/50 rounded p-2 text-xs font-mono h-32 overflow-y-auto border border-slate-800">
                  <div className="text-slate-400 border-b border-slate-800 mb-1 pb-1">SYSTEM LOGS</div>
                  {logs.map((log, i) => (
                    <div key={i} className="text-emerald-400/80 mb-0.5">{log}</div>
                  ))}
                  {logs.length === 0 && <div className="text-slate-600 italic">No activity logs...</div>}
               </div>

               <div className="mt-4 mb-4">
                 <button 
                  onClick={() => {
                    const cmd = currentVals.Emergency ? "RESUME" : "STOP";
                    sendCommand(cmd);
                  }}
                  className={cn(
                    "w-full py-4 rounded-xl font-bold text-lg tracking-widest shadow-lg transition-all",
                    currentVals.Emergency
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/50 animate-pulse" 
                      : "bg-red-600 hover:bg-red-500 text-white shadow-red-500/50"
                  )}
                 >
                   {currentVals.Emergency ? "⚠️ RESUME SYSTEM" : "🛑 EMERGENCY STOP"}
                 </button>
               </div>

               <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant={currentVals.Manual ? "secondary" : "primary"}
                    onClick={() => sendCommand("MODE:AUTO")}
                    disabled={!isConnected}
                    className="w-full"
                  >
                    <Sun className="w-4 h-4" /> Auto
                  </Button>
                  <Button 
                    variant={currentVals.Manual ? "primary" : "secondary"}
                    onClick={() => sendCommand("MODE:MANUAL")}
                    disabled={!isConnected}
                    className="w-full"
                  >
                    <Settings className="w-4 h-4" /> Manual
                  </Button>
               </div>
               
               {/* Manual Controls Section */}
               <div className={cn("space-y-4 transition-all duration-300", currentVals.Manual ? "opacity-100" : "opacity-30 pointer-events-none")}>
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Motor Control</label>
                    <div className="flex gap-2">
                      <Button 
                        variant="secondary" 
                        className="flex-1 active:bg-blue-600"
                        onMouseDown={() => sendCommand("DC:-200")}
                        onMouseUp={() => sendCommand("DC:0")}
                        disabled={!isConnected}
                      >
                        <ArrowLeft className="w-5 h-5" /> West
                      </Button>
                      <Button    
                         variant="secondary"
                         className="flex-1 active:bg-blue-600"
                         onMouseDown={() => sendCommand("DC:200")}
                         onMouseUp={() => sendCommand("DC:0")}
                         disabled={!isConnected}
                      >
                        East <ArrowRight className="w-5 h-5" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-800">
                     <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Cleaning System</label>
                     <Button 
                        variant="secondary"
                        className="w-full hover:bg-emerald-500/20 hover:text-emerald-400 hover:border-emerald-500/30"
                        onClick={() => sendCommand("CLEAN:1")}
                        disabled={!isConnected}
                     >
                       <RotateCcw className="w-4 h-4" /> Run Cleaning Cycle
                     </Button>
                  </div>
               </div>

               {/* Limits indicators */}
               <div className="flex justify-between text-xs text-slate-500 pt-2">
                  <div className="flex items-center gap-1">
                    <div className={cn("w-2 h-2 rounded-full", currentVals.LimitL ? "bg-red-500" : "bg-slate-700")} />
                    Left Limit
                  </div>
                  <div className="flex items-center gap-1">
                     Right Limit
                    <div className={cn("w-2 h-2 rounded-full", currentVals.LimitR ? "bg-red-500" : "bg-slate-700")} />
                  </div>
               </div>
            </Card>

          </div>

          {/* Right Column: Graphs */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="h-full min-h-[400px] flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-semibold text-slate-200">Real-time Light Intensity</h3>
                <div className="flex gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-yellow-400" /> Left Sensor
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-cyan-400" /> Right Sensor
                  </div>
                </div>
              </div>
              
              <div className="flex-1 w-full h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis 
                      dataKey="time" 
                      stroke="#475569" 
                      tick={{fill: '#475569', fontSize: 12}}
                      tickFormatter={(val) => val.split(':')[2]} // Show seconds only mostly
                    />
                    <YAxis stroke="#475569" tick={{fill: '#475569', fontSize: 12}} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="LDR_L" 
                      stroke="#facc15" 
                      strokeWidth={2} 
                      dot={false}
                      activeDot={{ r: 6 }} 
                      isAnimationActive={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="LDR_R" 
                      stroke="#22d3ee" 
                      strokeWidth={2} 
                      dot={false}
                      activeDot={{ r: 6 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            
            {/* Logs / Info could go here */}
            {/* <div className="grid grid-cols-2 gap-4">
               <Card className="h-40"></Card>
               <Card className="h-40"></Card>
            </div> */}
          </div>
        </div>
      </div>
    </div>
  );
}

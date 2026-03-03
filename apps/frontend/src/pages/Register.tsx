import { useEffect, useState } from 'react';
import { useRecoilState } from 'recoil';
import { userAtom } from '../atoms/userAtom';
import { useNavigate, useParams } from 'react-router-dom';
import { socketAtom } from '../atoms/socketAtom';
import { IP_ADDRESS } from '../Globle';

const Register = () => {
    const [name, setName] = useState<string>("");
    const [roomId, setRoomId] = useState<string>("");

    const parms = useParams();
    const [user, setUser] = useRecoilState(userAtom);
    const [socket, setSocket] = useRecoilState<WebSocket | null>(socketAtom);

    const [loading, setLoading] = useState<boolean>(false);

    const navigate = useNavigate();

    const generateId = () => {
        const id = Math.floor(Math.random() * 100000);
        return id.toString();
    }

    const generateRoomCode = () => {
        const generatedRoomCode = Math.floor(100000 + Math.random() * 900000).toString();
        setRoomId(generatedRoomCode);
    }

    const initializeSocket = () => {
        setLoading(true);
        let GeneratedId = "";
        if (user.id == "") {
            GeneratedId = generateId();
            setUser({
                id: GeneratedId,
                name: name,
                roomId: ""
            });
        }

        if (!socket || socket.readyState === WebSocket.CLOSED) {
            const u = {
                id: user.id == "" ? GeneratedId : user.id,
                name: name
            }
            if(name == "") {
                alert("Please enter a name to continue");
                setLoading(false);
                return;
            }
            const ws = new WebSocket(`ws://${IP_ADDRESS}:5000?roomId=${roomId}&id=${u.id}&name=${u.name}`);
          
            setSocket(ws);


            ws.onopen = () => {
                console.log("Connected to WebSocket");
            };

            ws.onopen = () => {
                console.log("Connected to WebSocket");
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type == "roomId") {
                    setRoomId(data.roomId);
                    console.log("Room ID : ", data.roomId);
                    setUser({
                        id: user.id == "" ? GeneratedId : user.id,
                        name: name,
                        roomId: data.roomId
                    });
                   
                    setLoading(false);
                    alert(data.message);
                    navigate("/code/" + data.roomId);
                }
            };
            ws.onclose = () => {
                console.log("WebSocket connection closed from register page");
                setLoading(false);
            };

        }
        else {

            setLoading(false);
        }
    }

    const handleNewRoom = () => {
        if (!loading)
            initializeSocket();

    }

    const handleJoinRoom = () => {
        if (roomId != "" && roomId.length == 6 && !loading) {

            initializeSocket();

        }
        else {
            alert("Please enter a room ID to join a room");
        }

    }

    useEffect(() => {
        setRoomId(parms.roomId || "");
    }, []);

    return (
        <div className="relative min-h-screen overflow-hidden bg-[#0d1117] text-[#c9d1d9] flex items-center justify-center px-4 py-8 register-page" style={{ fontFamily: "'Fira Code', Consolas, 'Courier New', monospace" }}>
            <div className="register-grid absolute inset-0" />
            <div className="register-glow register-glow-one" />
            <div className="register-glow register-glow-two" />

            <div className="relative z-10 w-full max-w-[500px] rounded-3xl border border-[#30363d] bg-[#111827]/90 backdrop-blur-sm shadow-[0_0_0_1px_rgba(56,139,253,0.08),0_25px_90px_rgba(0,0,0,0.6)] p-6 md:p-7">
                <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl bg-[#3b82f6] text-white flex items-center justify-center text-lg shadow-[0_8px_30px_rgba(59,130,246,0.45)]">
                        ⌨️
                    </div>
                    <div>
                        <h1 className="text-[44px] font-bold tracking-tight leading-none">
                            <span className="text-[#f0f6fc]">code</span><span className="text-[#58a6ff]">Together</span>
                        </h1>
                        <p className="mt-2 text-[34px] text-[#8b949e] leading-none">
                            <span className="text-[#6e7681]">// </span>join a session
                            <span className="inline-block w-2.5 h-7 ml-2 align-middle bg-[#58a6ff] register-blink" />
                        </p>
                    </div>
                </div>

                <div className="mt-6 border-t border-[#21262d] pt-6 space-y-5">
                    <div>
                        <label className="block text-[#3fb950] text-[24px] md:text-[26px] font-medium mb-2 leading-none">
                            <span className="text-[#3fb950]">// </span>
                            <span className="text-[#8b949e] uppercase tracking-wider text-[24px] md:text-[26px]">YOUR HANDLE</span>
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. dev_sam"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full h-[58px] px-5 text-[30px] placeholder:text-[#6e7681] bg-[#0b1220] text-[#c9d1d9] border border-[#30363d] rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#58a6ff]/60"
                        />
                    </div>

                    <div>
                        <label className="block text-[#3fb950] text-[24px] md:text-[26px] font-medium mb-2 leading-none">
                            <span className="text-[#3fb950]">// </span>
                            <span className="text-[#8b949e] uppercase tracking-wider text-[24px] md:text-[26px]">ROOM CODE</span>
                        </label>
                        <div className="h-[58px] bg-[#0b1220] border border-[#30363d] rounded-2xl flex items-center px-3 gap-2">
                            <input
                                type="number"
                                placeholder="566432"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                                className="flex-1 h-full bg-transparent px-2 text-[#3fb950] text-[28px] placeholder:text-[#2ea043] focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={generateRoomCode}
                                className="h-9 px-3 rounded-xl border border-[#2ea043]/40 bg-[#12261b] text-[#3fb950] text-base hover:bg-[#163320] transition"
                            >
                                new ↻
                            </button>
                        </div>
                    </div>

                    <button
                        disabled={loading}
                        onClick={handleNewRoom}
                        className="w-full h-[62px] rounded-2xl bg-gradient-to-r from-[#3b82f6] to-[#58a6ff] text-[#e6edf3] text-[28px] font-semibold shadow-[0_0_30px_rgba(88,166,255,0.35)] hover:brightness-110 transition"
                    >
                        ✦ Create New Room
                    </button>

                    <button
                        disabled={loading}
                        onClick={handleJoinRoom}
                        className="w-full h-[62px] rounded-2xl border border-[#2ea043]/60 bg-transparent text-[#3fb950] text-[28px] font-semibold hover:bg-[#12261b] transition"
                    >
                        → Join Room
                    </button>

                    <div className="pt-1 text-center text-[22px] text-[#8b949e]">
                        real-time · <span className="text-[#58a6ff]">collaborative</span> · multi-language
                    </div>

                    <div className="flex justify-center gap-3 flex-wrap">
                        {['C++', 'Python', 'JS', 'Go'].map((language) => (
                            <span key={language} className="px-3 h-8 inline-flex items-center rounded-full bg-[#1f2937] border border-[#30363d] text-[#8b949e] text-sm">
                                {language}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Register;

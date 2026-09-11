"use client";

import { useEffect, useRef, type HTMLAttributes } from "react";

export type LiveWaveformProps = HTMLAttributes<HTMLDivElement> & {
	active?: boolean;
	processing?: boolean;
	barWidth?: number;
	barHeight?: number;
	barGap?: number;
	barRadius?: number;
	barColor?: string;
	fadeEdges?: boolean;
	height?: string | number;
	sensitivity?: number;
	historySize?: number;
	updateRate?: number;
	mode?: "scrolling" | "static";
	onError?: (error: Error) => void;
};

export function LiveWaveform({
	active = false,
	processing = false,
	barWidth = 3,
	barHeight = 4,
	barGap = 1,
	barRadius = 1.5,
	barColor = "currentColor",
	fadeEdges = true,
	height = 64,
	sensitivity = 1,
	historySize = 60,
	updateRate = 30,
	mode = "static",
	onError,
	className,
	...props
}: LiveWaveformProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const analyserRef = useRef<AnalyserNode | null>(null);
	const audioContextRef = useRef<AudioContext | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const levelsRef = useRef<number[]>([]);
	const historyRef = useRef<number[]>([]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!canvas || !container) return;

		const resizeObserver = new ResizeObserver(() => {
			const rect = container.getBoundingClientRect();
			const dpr = window.devicePixelRatio || 1;
			canvas.width = Math.max(1, Math.floor(rect.width * dpr));
			canvas.height = Math.max(1, Math.floor(rect.height * dpr));
			canvas.style.width = `${rect.width}px`;
			canvas.style.height = `${rect.height}px`;
		});

		resizeObserver.observe(container);
		return () => resizeObserver.disconnect();
	}, []);

	useEffect(() => {
		if (!active) {
			streamRef.current?.getTracks().forEach((track) => track.stop());
			streamRef.current = null;
			analyserRef.current = null;
			if (audioContextRef.current?.state !== "closed") {
				void audioContextRef.current?.close();
			}
			audioContextRef.current = null;
			return;
		}

		let cancelled = false;

		async function connectMicrophone() {
			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					audio: {
						autoGainControl: true,
						echoCancellation: true,
						noiseSuppression: true,
					},
				});
				if (cancelled) {
					stream.getTracks().forEach((track) => track.stop());
					return;
				}

				const AudioContextConstructor =
					window.AudioContext ||
					(window as typeof window & { webkitAudioContext?: typeof AudioContext })
						.webkitAudioContext;
				if (!AudioContextConstructor) {
					throw new Error("Audio input is not supported in this browser.");
				}

				const audioContext = new AudioContextConstructor();
				const analyser = audioContext.createAnalyser();
				analyser.fftSize = 256;
				analyser.smoothingTimeConstant = 0.8;
				audioContext.createMediaStreamSource(stream).connect(analyser);
				streamRef.current = stream;
				audioContextRef.current = audioContext;
				analyserRef.current = analyser;
			} catch (error) {
				onError?.(error instanceof Error ? error : new Error("Microphone access failed."));
			}
		}

		void connectMicrophone();
		return () => {
			cancelled = true;
			streamRef.current?.getTracks().forEach((track) => track.stop());
			streamRef.current = null;
			analyserRef.current = null;
			if (audioContextRef.current?.state !== "closed") {
				void audioContextRef.current?.close();
			}
			audioContextRef.current = null;
		};
	}, [active, onError]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const context = canvas.getContext("2d");
		if (!context) return;

		let animationFrame = 0;
		let lastUpdate = 0;
		let phase = 0;

		const draw = (time: number) => {
			const rect = canvas.getBoundingClientRect();
			const dpr = window.devicePixelRatio || 1;
			const width = rect.width;
			const canvasHeight = rect.height;
			const step = barWidth + barGap;
			const barCount = Math.max(1, Math.floor(width / (step * 2)));

			if (time - lastUpdate >= updateRate) {
				lastUpdate = time;
				phase += 0.08;
				let levels: number[];

				if (processing) {
					levels = Array.from({ length: barCount }, (_, index) => {
						const wave = Math.sin(phase + index * 0.22) * 0.18;
						return Math.max(0.08, 0.28 + wave);
					});
				} else if (active && analyserRef.current) {
					const data = new Uint8Array(analyserRef.current.frequencyBinCount);
					analyserRef.current.getByteFrequencyData(data);
					levels = Array.from({ length: barCount }, (_, index) => {
						const dataIndex = Math.floor((index / barCount) * data.length);
						return Math.max(0.05, Math.min(1, (data[dataIndex] / 255) * sensitivity));
					});
				} else {
					levels = levelsRef.current.map((level) => level * 0.86);
				}

				if (mode === "scrolling" && (active || processing)) {
					historyRef.current = [...historyRef.current, levels.at(-1) ?? 0.08].slice(-historySize);
					levels = historyRef.current;
				}
				levelsRef.current = levels;
			}

			context.setTransform(dpr, 0, 0, dpr, 0, 0);
			context.clearRect(0, 0, width, canvasHeight);
			context.fillStyle = barColor;
			context.globalAlpha = 0.9;
			const renderedLevels = levelsRef.current.slice(0, barCount);
			const center = canvasHeight / 2;
			const centerX = width / 2;

			renderedLevels.forEach((level, index) => {
				const bar = Math.max(barHeight, level * canvasHeight * 0.82);
				const y = center - bar / 2;
				const rightX = centerX + index * step;
				const leftX = centerX - (index + 1) * step;

				for (const x of [leftX, rightX]) {
					context.beginPath();
					context.roundRect(x, y, barWidth, bar, barRadius);
					context.fill();
				}
			});

			if (fadeEdges && width > 0) {
				const fade = context.createLinearGradient(0, 0, width, 0);
				fade.addColorStop(0, "rgba(0, 0, 0, 0)");
				fade.addColorStop(0.12, "rgba(0, 0, 0, 1)");
				fade.addColorStop(0.88, "rgba(0, 0, 0, 1)");
				fade.addColorStop(1, "rgba(0, 0, 0, 0)");
				context.globalCompositeOperation = "destination-in";
				context.fillStyle = fade;
				context.fillRect(0, 0, width, canvasHeight);
				context.globalCompositeOperation = "source-over";
			}

			context.globalAlpha = 1;
			animationFrame = requestAnimationFrame(draw);
		};

		animationFrame = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(animationFrame);
	}, [
		active,
		barColor,
		barGap,
		barHeight,
		barRadius,
		barWidth,
		fadeEdges,
		historySize,
		mode,
		processing,
		sensitivity,
		updateRate,
	]);

	return (
		<div
			{...props}
			aria-label={active ? "Live audio waveform" : processing ? "Processing audio" : "Audio waveform idle"}
			className={className}
			ref={containerRef}
			role="img"
			style={{ ...props.style, height: typeof height === "number" ? `${height}px` : height }}
		>
			<canvas aria-hidden="true" className="block size-full" ref={canvasRef} />
		</div>
	);
}

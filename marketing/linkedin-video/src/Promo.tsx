import { linearTiming, springTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Background, CornerLogo, ProgressBar } from "./components/Chrome";
import { Soundtrack, Voice } from "./components/Soundtrack";
import type { SceneProps } from "./copy";
import { AgentsScene } from "./scenes/AgentsScene";
import { CompareScene } from "./scenes/CompareScene";
import { CtaScene } from "./scenes/CtaScene";
import { DecisionScene } from "./scenes/DecisionScene";
import { GatesScene } from "./scenes/GatesScene";
import { HookScene } from "./scenes/HookScene";
import { LensScene } from "./scenes/LensScene";
import { LogoScene } from "./scenes/LogoScene";
import { PlanScene } from "./scenes/PlanScene";
import { QuestionScene } from "./scenes/QuestionScene";
import { promoDuration, sceneDurations, sceneStarts, SWEEP, TRANSITIONS } from "./timeline";

// A diagonal sweep of brand-orange light over a cut point. Built from CSS gradients
// instead of @remotion/effects' lightLeak(), whose palette drifts to yellow and green.
const LightSweep: React.FC<{ readonly reverse?: boolean }> = ({ reverse = false }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = interpolate(frame, [0, durationInFrames - 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const x = reverse ? 120 - progress * 140 : -20 + progress * 140;
  const y = 110 - progress * 120;

  return (
    <AbsoluteFill style={{ mixBlendMode: "screen", opacity: Math.sin(progress * Math.PI) * 0.85 }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 75% 55% at ${x}% ${y}%, rgba(255, 138, 26, 0.75), rgba(255, 107, 0, 0.28) 38%, transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `linear-gradient(${reverse ? 245 : 115}deg, transparent ${progress * 120 - 30}%, rgba(255, 177, 90, 0.45) ${
            progress * 120 - 12
          }%, transparent ${progress * 120 + 6}%)`,
        }}
      />
    </AbsoluteFill>
  );
};

export const Promo: React.FC<SceneProps> = ({ lang }) => {
  const { fps } = useVideoConfig();
  const springy = (durationInFrames: number) => springTiming({ config: { damping: 200 }, durationInFrames });
  const durations = sceneDurations(lang);
  const starts = sceneStarts(lang);
  const total = promoDuration(lang);

  return (
    <AbsoluteFill>
      <Background />
      <TransitionSeries>
        <TransitionSeries.Sequence name="Hook" durationInFrames={durations.hook} premountFor={fps}>
          <HookScene lang={lang} />
          <Voice lang={lang} scene="hook" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITIONS.hook })}
        />
        <TransitionSeries.Sequence name="Question" durationInFrames={durations.question} premountFor={fps}>
          <QuestionScene lang={lang} />
          <Voice lang={lang} scene="question" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={SWEEP} premountFor={fps}>
          <LightSweep />
        </TransitionSeries.Overlay>
        <TransitionSeries.Sequence name="Logo" durationInFrames={durations.logo} premountFor={fps}>
          <LogoScene lang={lang} />
          <Voice lang={lang} scene="logo" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={springy(TRANSITIONS.logo)}
        />
        <TransitionSeries.Sequence name="Plan" durationInFrames={durations.plan} premountFor={fps}>
          <PlanScene lang={lang} />
          <Voice lang={lang} scene="plan" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={springy(TRANSITIONS.plan)}
        />
        <TransitionSeries.Sequence name="Gates" durationInFrames={durations.gates} premountFor={fps}>
          <GatesScene lang={lang} />
          <Voice lang={lang} scene="gates" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITIONS.gates })}
        />
        <TransitionSeries.Sequence name="Decision" durationInFrames={durations.decision} premountFor={fps}>
          <DecisionScene lang={lang} />
          <Voice lang={lang} scene="decision" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={springy(TRANSITIONS.decision)}
        />
        <TransitionSeries.Sequence name="Compare" durationInFrames={durations.compare} premountFor={fps}>
          <CompareScene lang={lang} />
          <Voice lang={lang} scene="compare" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITIONS.compare })}
        />
        <TransitionSeries.Sequence name="Lens" durationInFrames={durations.lens} premountFor={fps}>
          <LensScene lang={lang} />
          <Voice lang={lang} scene="lens" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={springy(TRANSITIONS.lens)}
        />
        <TransitionSeries.Sequence name="Agents" durationInFrames={durations.agents} premountFor={fps}>
          <AgentsScene lang={lang} />
          <Voice lang={lang} scene="agents" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={SWEEP} premountFor={fps}>
          <LightSweep reverse />
        </TransitionSeries.Overlay>
        <TransitionSeries.Sequence name="CTA" durationInFrames={durations.cta} premountFor={fps}>
          <CtaScene lang={lang} />
          <Voice lang={lang} scene="cta" />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <CornerLogo from={starts.plan} to={starts.cta} />
      <ProgressBar total={total} />
      <Soundtrack lang={lang} total={total} />
    </AbsoluteFill>
  );
};

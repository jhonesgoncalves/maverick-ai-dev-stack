import type React from "react";
import { AbsoluteFill, Composition, Folder } from "remotion";
import { Background } from "./components/Chrome";
import type { SceneProps } from "./copy";
import { Promo } from "./Promo";
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
import { FPS, promoDuration, SCENES } from "./timeline";

// LinkedIn feed, 4:5 portrait.
const WIDTH = 1080;
const HEIGHT = 1350;

// Scenes are transparent; previewed alone they get the shared backdrop.
const withBackground = (Scene: React.FC<SceneProps>) => {
  const Previewed: React.FC<SceneProps> = (props) => (
    <AbsoluteFill>
      <Background />
      <Scene {...props} />
    </AbsoluteFill>
  );
  return Previewed;
};

const Hook = withBackground(HookScene);
const Question = withBackground(QuestionScene);
const Logo = withBackground(LogoScene);
const Plan = withBackground(PlanScene);
const Gates = withBackground(GatesScene);
const Decision = withBackground(DecisionScene);
const Compare = withBackground(CompareScene);
const Lens = withBackground(LensScene);
const Agents = withBackground(AgentsScene);
const Cta = withBackground(CtaScene);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MaverickPromo-PT"
        component={Promo}
        durationInFrames={promoDuration("pt")}
        calculateMetadata={({ props }) => ({ durationInFrames: promoDuration(props.lang) })}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ lang: "pt" as const }}
      />
      <Composition
        id="MaverickPromo-EN"
        component={Promo}
        durationInFrames={promoDuration("en")}
        calculateMetadata={({ props }) => ({ durationInFrames: promoDuration(props.lang) })}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ lang: "en" as const }}
      />
      <Folder name="Scenes">
        <Composition id="Hook" component={Hook} durationInFrames={SCENES.hook} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ lang: "pt" as const }} />
        <Composition id="Question" component={Question} durationInFrames={SCENES.question} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ lang: "pt" as const }} />
        <Composition id="Logo" component={Logo} durationInFrames={SCENES.logo} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ lang: "pt" as const }} />
        <Composition id="Plan" component={Plan} durationInFrames={SCENES.plan} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ lang: "pt" as const }} />
        <Composition id="Gates" component={Gates} durationInFrames={SCENES.gates} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ lang: "pt" as const }} />
        <Composition id="Decision" component={Decision} durationInFrames={SCENES.decision} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ lang: "pt" as const }} />
        <Composition id="Compare" component={Compare} durationInFrames={SCENES.compare} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ lang: "pt" as const }} />
        <Composition id="Lens" component={Lens} durationInFrames={SCENES.lens} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ lang: "pt" as const }} />
        <Composition id="Agents" component={Agents} durationInFrames={SCENES.agents} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ lang: "pt" as const }} />
        <Composition id="CTA" component={Cta} durationInFrames={SCENES.cta} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ lang: "pt" as const }} />
      </Folder>
    </>
  );
};

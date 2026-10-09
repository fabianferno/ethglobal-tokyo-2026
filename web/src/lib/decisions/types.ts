export type ChoiceQuestion = { type: "choice"; name: string; instructions: string; choices: { value: string; description: string }[] };
export type PredicateQuestion = { type: "predicate"; name: string; instructions: string };
export type Question = ChoiceQuestion | PredicateQuestion;
export type DecisionAnswer =
  | { type: "choice"; name: string; choice: string; confidence?: number; probabilities: (number | { value: string; probability: number })[] }
  | { type: "predicate"; name: string; probability: number }
  | { type: "score" | "refusal"; name: string };

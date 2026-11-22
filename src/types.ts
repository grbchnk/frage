export interface PhotoPanel { path: string; trim_end?: number; replace_letters?: string; }
export interface Media { kind: string; path?: string; panels?: PhotoPanel[]; tokens?: string[]; joiner?: string; question_alt: string; question_masks_normalized?: number[][]; }
export interface Question { id: string; value: number; prompt: string; media: Media | null; type?:QuestionType; options?:string[]; unit?:string; hasHint?:boolean; }
export interface Category { id: number; title: string; description: string; questions: Question[]; }
export interface Pack { revision: string; categories: Category[]; rounds: {id: number; category_ids: number[]}[]; finals?:FinalCategory[]; }
export interface Participant { id: string; name: string; }
export interface Buzzer { id: string; question_id: string | null; window_id: string; claimant: string | null; accepting: boolean; excluded: string[]; }
export interface Answer { answer: string; explanation: string; accepted_answers: string[]; host_note: string; hint?:string; correctOption?:number; target?:number; correctOrder?:number[]; finalPrompt?:string; }
export interface Player { id: string; name: string; score: number; }
export interface Game {
  phase: 'lobby'|'board'|'question'|'answer'|'break'|'final'|'finished';
  players: Player[]; turnIndex: number; roundIndex: number; completed: string[];
  activeQuestionId: string | null; revealed: Answer | null; winnerId: string | null;
  event: number;
  questionsPerCategory: number;
  categoryIds: number[];
  boardPage?: number;
  estimateTimer?:boolean;
  selectedQuestions?:string[];
  inputRound?:InputRound;
  results?:RoundResult[];
  finalWagerId?:string;
  hint?:string;
  final?:{enabled:true; stage?:'category'|'wager'|'written'|'result'; chooser?:string; categories?:string[]; categoryId?:string; questionId?:string; prompt?:string};
  questionOpenedAt: number | null;
  activeQuestionValue: number | null;
  scoreChanges: Record<string,number>;
  feedback?: {kind:'correct'|'wrong'; playerId:string; event:number; at:number} | null;
}
export interface Snapshot { id: string; state: Game; revision: number; }

export type QuestionType = 'buzzer'|'estimate'|'turns'|'choice'|'order';
export type RoundInput = number|string|number[];
export type InputStage = 'estimate'|'turns'|'choice'|'order'|'wager'|'written';
export interface InputRound {
  id: string;
  stage: InputStage;
  submitted: string[];
  closed?:boolean;
  deadline?:number;
  autoScorePaused?:boolean;
  options?: {id:number;label:string}[];
  eliminated?: number[];
  queue?: string[];
  turn?: number;
  limits?: Record<string,number>;
}
export interface RoundResult { playerId:string; input?:string; delta:number; correct?:boolean; wager?:number; timedOut?:boolean; }
export interface FinalCategory { id:string; title:string; questions:{id:string}[]; }

export type QuestionType = 'multiple-choice' | 'true-false' | 'short-answer';
export interface Choice { id: string; text: string; correct: boolean }
export interface Question { id: string; type: QuestionType; text: string; choices: Choice[]; answer?: string; lockChoices: boolean; group?: string; section: string }
export interface Exam { questions: Question[]; warnings: string[]; sourceFormat: string }
export interface Version { code: string; questions: Question[]; answers: Array<{question:number; answer:string; originalId:string}> }
export interface MixResult { seed: string; versions: Version[]; warnings: string[] }
export function docDe(input:string, options?:{format?:'text'|'aiken'|'gift'}):Exam;
export function docDeDocx(input:ArrayBuffer|Uint8Array):Promise<Exam>;
export function tronDe(exam:Exam, options?:{soMa?:number;count?:number;maBatDau?:number;startCode?:number;seed?:string|number;canBang?:boolean;balance?:boolean}):MixResult;
export function xuatHtml(version:Version, meta?:{title?:string;school?:string;duration?:string}):string;
export function xuatText(version:Version, meta?:{title?:string;duration?:string}):string;
export function xuatCsv(result:MixResult):string;
export function xuatBangDapAnHtml(result:MixResult, meta?:{title?:string}):string;
export function xuatAiken(exam:Exam):string;
export function xuatGift(exam:Exam):string;
export const VERSION:string;

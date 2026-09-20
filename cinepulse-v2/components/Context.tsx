'use client';
import {createContext,useContext} from 'react';
import type {Config,LibraryEntry,Title,User} from '@/lib/types';
export interface AppContextValue {
 user:User|null; config:Config|null; library:LibraryEntry[];
 openTitle:(id:string,tab?:'overview'|'pulse'|'reviews')=>void;
 save:(title:Title)=>Promise<void>; remove:(title:Title)=>Promise<void>;
 updateLibrary:(title:Title,status:LibraryEntry['status'],rating?:number|null)=>Promise<void>;
 refresh:()=>Promise<void>; toast:(text:string)=>void; needAuth:()=>boolean; showAuth:()=>void; busyIds:Set<string>
}
export const AppContext=createContext<AppContextValue>(null!);
export const useApp=()=>useContext(AppContext);

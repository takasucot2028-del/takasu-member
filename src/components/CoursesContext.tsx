import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Course } from '../types';
import { COURSES } from '../utils/constants';
import { getCourses } from '../api/data';

interface CoursesState {
  courses: Course[];        // 全教室（無効も含む）
  activeCourses: Course[];  // 有効な教室のみ（選択肢用）
  reloadCourses: () => Promise<void>;
}

const CoursesContext = createContext<CoursesState | null>(null);

// 教室マスタをアプリ起動時に1回読み込み、全画面へ供給する。
// 読み込み完了までは固定の COURSES を初期値として使う（空表示を防ぐ）。
export function CoursesProvider({ children }: { children: ReactNode }) {
  const [courses, setCourses] = useState<Course[]>(
    () => COURSES.map(c => ({ ...c, active: c.active !== false }))
  );

  const reloadCourses = useCallback(async () => {
    const list = await getCourses();
    setCourses(list);
  }, []);

  useEffect(() => { reloadCourses(); }, [reloadCourses]);

  const activeCourses = courses.filter(c => c.active !== false);

  return (
    <CoursesContext.Provider value={{ courses, activeCourses, reloadCourses }}>
      {children}
    </CoursesContext.Provider>
  );
}

export function useCourses(): CoursesState {
  const ctx = useContext(CoursesContext);
  if (!ctx) throw new Error('useCourses は CoursesProvider の内側で使用してください');
  return ctx;
}

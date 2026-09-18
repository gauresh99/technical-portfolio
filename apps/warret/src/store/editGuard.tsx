import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { purple } from '../components/ui';

type EditGuardContextValue = {
  hasDirtyEdit: boolean;
  setHasDirtyEdit: (dirty: boolean) => void;
  requestLeave: (action: () => void) => void;
  setBeforeSave: (handler: null | (() => void)) => void;
  setBeforeDiscard: (handler: null | (() => void)) => void;
};

const EditGuardContext = createContext<EditGuardContextValue | undefined>(undefined);

export function EditGuardProvider({ children }: { children: React.ReactNode }) {
  const [hasDirtyEdit, setHasDirtyEditRaw] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | (() => void)>(null);
  const beforeSaveRef = useRef<null | (() => void)>(null);
  const beforeDiscardRef = useRef<null | (() => void)>(null);

  // Stable reference — does not change when hasDirtyEdit changes, so consumers
  // that list setHasDirtyEdit in useEffect deps won't re-run spuriously.
  const setHasDirtyEdit = useCallback((dirty: boolean) => setHasDirtyEditRaw(dirty), []);

  const value = useMemo<EditGuardContextValue>(() => ({
    hasDirtyEdit,
    setHasDirtyEdit,
    setBeforeSave: (handler) => {
      beforeSaveRef.current = handler;
    },
    setBeforeDiscard: (handler) => {
      beforeDiscardRef.current = handler;
    },
    requestLeave: (action) => {
      if (!hasDirtyEdit) {
        action();
        return;
      }
      setPendingAction(() => action);
      setPromptOpen(true);
    },
  }), [hasDirtyEdit]);

  const saveNow = () => {
    const action = pendingAction;
    beforeSaveRef.current?.();
    setHasDirtyEdit(false);
    setPromptOpen(false);
    setPendingAction(null);
    action?.();
  };
  const discardChanges = () => {
    const action = pendingAction;
    beforeDiscardRef.current?.();
    setHasDirtyEdit(false);
    setPromptOpen(false);
    setPendingAction(null);
    action?.();
  };

  return (
    <EditGuardContext.Provider value={value}>
      {children}
      <Modal visible={promptOpen} transparent animationType="fade" onRequestClose={() => setPromptOpen(false)}>
        <View style={s.backdrop}>
          <View style={s.menu}>
            <Text style={s.title}>Save changes?</Text>
            <Text style={s.sub}>Save your latest edits before leaving, cancel them, or keep editing.</Text>
            <Pressable onPress={saveNow} style={s.primary}>
              <Text style={s.primaryText}>Save now</Text>
            </Pressable>
            {beforeDiscardRef.current ? (
              <Pressable onPress={discardChanges} style={s.danger}>
                <Text style={s.dangerText}>Cancel</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => setPromptOpen(false)} style={s.secondary}>
              <Text style={s.secondaryText}>Keep editing</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </EditGuardContext.Provider>
  );
}

export function useEditGuard() {
  const context = useContext(EditGuardContext);
  if (!context) throw new Error('useEditGuard must be used within EditGuardProvider');
  return context;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(255,255,255,.9)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  menu: { width: '100%', maxWidth: 310, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#E8E4F7', padding: 18, shadowColor: '#000', shadowOpacity: .12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  title: { color: '#25222F', fontSize: 20, lineHeight: 25, fontWeight: '900' },
  sub: { color: '#7E778E', fontSize: 14, lineHeight: 20, fontWeight: '700', marginTop: 6, marginBottom: 14 },
  primary: { minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: purple },
  primaryText: { color: 'white', fontSize: 15, lineHeight: 19, fontWeight: '900' },
  danger: { minHeight: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 8, backgroundColor: '#FFE9EC' },
  dangerText: { color: '#D83A41', fontSize: 14, lineHeight: 18, fontWeight: '900' },
  secondary: { minHeight: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 8, backgroundColor: '#F4F1FF' },
  secondaryText: { color: purple, fontSize: 14, lineHeight: 18, fontWeight: '900' },
});

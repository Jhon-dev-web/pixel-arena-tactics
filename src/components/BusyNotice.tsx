import { t } from '../locales';
import { HeroActivity, TaskRequest, taskName } from '../game/activity';
import { Button, Dialog } from './ui';

// The hero does ONE task at a time (activity.ts). Asking for another while he is busy ends here, from every screen (Mining, Woodcutting, Hunt, Dungeon, Forge, Oficios): it names what he is
// doing and what happens to it, and the main button stops it and starts the task the player asked for. "Manter" leaves things as they were.
export default function BusyNotice({ activity, next, onStop, onKeep }: { activity: HeroActivity; next: TaskRequest; onStop: () => void; onKeep: () => void }) {
  // The main button: "Cancelar e forjar" / "Cancelar e produzir" when a production batch is what gets cancelled, "Parar e forjar" / "Parar e produzir" when something else is, else "Parar e começar {task}".
  const stopLabel =
    next.kind === 'craft'
      ? t(`busy.${activity === 'craft' ? 'cancel' : 'stop'}${next.craft === 'forge' ? 'Forge' : 'Produce'}`)
      : t('busy.stopAndStart', { next: t(`busy.${taskName(next)}`) });
  return (
    <Dialog
      title={t('busy.title')}
      footer={
        <>
          <Button variant="primary" block onClick={onStop}>
            {stopLabel}
          </Button>
          <Button block onClick={onKeep}>
            {t('busy.keep', { activity: t(`busy.${activity}`) })}
          </Button>
        </>
      }
    >
      <p>{t('busy.heroIn', { activity: t(`busy.${activity}`) })}</p>
      <p className="ui-note">{t(`busy.whatHappens_${activity}`)}</p>
    </Dialog>
  );
}

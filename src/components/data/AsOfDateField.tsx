// The As-of date, picked right where a file is uploaded. It is the same date as the one at the top of the
// page - choosing it here sets that one - so every upload and every screen still works from one date.
import { useScope } from '@/context/ScopeContext';

export function AsOfDateField({ id = 'upload-asof' }: { id?: string }) {
  const { asOfDate, asOfDateChosen, setAsOfDate } = useScope();
  const value = asOfDateChosen && asOfDate ? asOfDate : '';
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-lg px-4 py-3 ${value ? 'bg-navy-50' : 'bg-warning-bg'}`}>
      <label htmlFor={id} className="text-[13px] font-bold text-navy-900">
        Data as of
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => setAsOfDate(e.target.value || null)}
        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
      />
      <span className="text-[12px] text-gray-600">
        {value
          ? 'Every file is loaded as of this date (also the As-of date at the top of the page).'
          : 'Pick the date this data is for - every file is loaded as of it.'}
      </span>
    </div>
  );
}

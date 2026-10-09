import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { AlertCircle, LockKeyhole, Search, RefreshCw } from 'lucide-react';
export function FilterChoice({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
 return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{options.map(option => <SelectItem value={option} key={option}>{option}</SelectItem>)}</SelectContent></Select>;
}
export function EmptyState({ type = 'empty', onReset }: { type?: 'empty' | 'error' | 'permission' | 'deferred'; onReset?: () => void }) {
 const content = { empty: ['No matching records', 'Try adjusting your search or filters.'], error: ['Records could not be loaded', 'Your financial records remain unchanged.'], permission: ['Access restricted', 'This view is unavailable for the selected role.'], deferred: ['Not implemented in this phase', 'This module is retained for the next approved phase.'] }[type];
 const Icon = type === 'permission' ? LockKeyhole : type === 'error' ? AlertCircle : Search;
 return <div className="cf-empty" role={type === 'error' ? 'alert' : 'status'}><Icon size={28}/><h2>{content[0]}</h2><p>{content[1]}</p>{onReset && <Button variant="outline" onClick={onReset}>{type === 'error' ? <RefreshCw size={16}/> : <Search size={16}/>} {type === 'error' ? 'Try again' : 'Clear filters'}</Button>}</div>;
}

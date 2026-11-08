import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { fixtureResponse, pcFixture } from '../../test/price-cost-fixtures';
import { CatalogueProvider } from '../catalogue';
import Explore from './Explore';
vi.mock('../../lib/api',()=>({api:{get:vi.fn()},errorMessage:()=> 'Request failed'}));
beforeEach(()=>{vi.clearAllMocks();vi.mocked(api.get).mockImplementation(async(url)=>({data:fixtureResponse(url)}));});
function open(query=''){return render(<MemoryRouter initialEntries={['/app/explore'+query]}><CatalogueProvider><Explore/></CatalogueProvider></MemoryRouter>)}
it('integrates product/tax and common-period comparison, with real evidence paths',async()=>{
 open();await screen.findByText('€2.282');
 await userEvent.selectOptions(screen.getByLabelText('Fuel product'),'euro_super_95');await screen.findByText('€2.128');
 await userEvent.selectOptions(screen.getByLabelText('Tax basis'),'without_tax');expect(await screen.findByText('€1.277')).toBeInTheDocument();
 await userEvent.click(screen.getByRole('button',{name:'Compare countries'}));await userEvent.selectOptions(screen.getByLabelText('Compare with Germany'),'FR');await userEvent.click(screen.getByRole('button',{name:'Apply country comparison'}));
 await screen.findByText('Same-period country comparison');expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/fuel/compare?'),expect.objectContaining({signal:expect.any(AbortSignal)}));
 await userEvent.click(screen.getAllByRole('button',{name:'Inspect observation'})[0]);await screen.findByRole('heading',{name:'Source evidence'});expect(await screen.findByText('Exact values')).toBeInTheDocument();
});
it('keeps rate/index meaning and derived inverse explicit',async()=>{
 open('?domain=inflation&measurement=annual_rate&start=2026-05-01&end=2026-10-01');await screen.findByText('2.8%');expect(screen.getByText(/percentage points vs/)).toBeInTheDocument();expect(screen.getAllByText('Estimated').length).toBeGreaterThan(0);
 await userEvent.selectOptions(screen.getByLabelText('Measurement'),'index');await screen.findByText('103.8');expect(screen.queryByRole('button',{name:'Compare countries'})).not.toBeInTheDocument();
 await userEvent.click(screen.getByRole('button',{name:'Exchange rates'}));await userEvent.click(screen.getByRole('button',{name:'3 months'}));await userEvent.click(screen.getByLabelText('Show derived inverse'));const rate=pcFixture.histories['exchange-rates:GBP'].items.at(-1)!;if(rate.measurement_type!=='reference_rate')throw new Error('Fixture currency');expect(await screen.findByText(rate.inverse_rate!)).toBeInTheDocument();
 expect(screen.getByText(/Official direction:/)).toHaveTextContent('1 EUR');
});

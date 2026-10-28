import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({
  api: {
    listSellers: vi.fn(),
    createSeller: vi.fn(),
  },
}))

import { api } from '../api'
import { renderWithProviders } from '../../test/helpers'
import SellerField from './SellerField'

const SELLERS = [
  { id: 5, name: 'coinhound', store_url: 'https://www.ebay.com/usr/coinhound' },
  { id: 6, name: 'example_seller', store_url: null },
]

beforeEach(() => {
  vi.clearAllMocks()
  api.listSellers.mockResolvedValue(SELLERS)
})

/** The field, with its seller list read, and what it reports. */
async function open(value = '') {
  const onChange = vi.fn()
  renderWithProviders(<SellerField value={value} onChange={onChange} />)
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Seller' })).toHaveTextContent(
      'coinhound',
    ),
  )
  return onChange
}

const address = () => screen.getByRole('textbox', { name: "Seller's store address" })

describe('SellerField: a store address', () => {
  it('chooses the seller whose store it is, however the address is written', async () => {
    const onChange = await open()
    await userEvent.type(address(), 'EBAY.com/usr/coinhound/?_trksid=1{Enter}')

    expect(onChange).toHaveBeenCalledWith('5')
    expect(api.createSeller).not.toHaveBeenCalled()
    expect(screen.getByText('coinhound')).toBeInTheDocument()
  })

  it('chooses the seller of the name the address gives, when no store is on file', async () => {
    const onChange = await open()
    await userEvent.type(address(), 'https://www.ebay.com/usr/Example_Seller')
    await userEvent.tab()

    expect(onChange).toHaveBeenCalledWith('6')
    expect(api.createSeller).not.toHaveBeenCalled()
  })

  it('adds a seller for a store not on file, named as the address names it', async () => {
    api.createSeller.mockResolvedValue({
      id: 9,
      name: 'newhound',
      store_url: 'https://newhound.hibid.com',
    })
    const onChange = await open()
    await userEvent.type(address(), 'newhound.hibid.com{Enter}')

    await waitFor(() =>
      expect(api.createSeller).toHaveBeenCalledWith({
        name: 'newhound',
        store_url: 'https://newhound.hibid.com',
      }),
    )
    expect(onChange).toHaveBeenCalledWith('9')
    expect(await screen.findByText(/newhound.*added/)).toBeInTheDocument()

    // Leaving the box after Enter picks nothing again: no second seller.
    await userEvent.tab()
    expect(api.createSeller).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/newhound.*added/)).toBeInTheDocument()
  })

  it('hides the pulldown while an address is typed, and shows it again when cleared', async () => {
    await open()
    await userEvent.type(address(), 'ebay.com/usr/coinhound')
    expect(screen.queryByRole('combobox', { name: 'Seller' })).toBeNull()

    await userEvent.clear(address())
    expect(screen.getByRole('combobox', { name: 'Seller' })).toBeInTheDocument()
  })

  it('says so when the text is not a web address, and adds nobody', async () => {
    const onChange = await open()
    await userEvent.type(address(), 'coin hound{Enter}')

    expect(screen.getByText(/not a web address/i)).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(api.createSeller).not.toHaveBeenCalled()
  })
})

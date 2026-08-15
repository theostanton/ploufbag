'use server'

import { Auth } from "@auth/index";
import { DescriptionPreferences, type DescriptionPreference } from "@database/descriptionPreferences";
import { type Failure, isSuccess } from '@ploufbag/common';
import { revalidatePath } from 'next/cache';

export async function updateDescriptionPreferences(formData: FormData) {
    const pilotId = await Auth.getSelfPilotId();
    
    const preferences: DescriptionPreference = {
        pilot_id: pilotId,
        include_sites: formData.get('include_sites') === 'on',
        include_wind: formData.get('include_wind') === 'on',
        include_wing_aggregate: formData.get('include_wing_aggregate') === 'on',
        include_year_aggregate: formData.get('include_year_aggregate') === 'on',
        include_all_time_aggregate: formData.get('include_all_time_aggregate') === 'on'
    };

    const result = await DescriptionPreferences.upsert(preferences);
    
    if (!isSuccess(result)) {
        throw new Error(result[1]);
    }
    
    revalidatePath('/dashboard');
    return preferences;
}
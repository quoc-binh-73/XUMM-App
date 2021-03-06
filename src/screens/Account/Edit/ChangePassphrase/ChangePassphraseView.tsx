/**
 * Accounts Edit Change Passphrase
 */

import React, { Component } from 'react';
import { Alert, View, Platform, KeyboardAvoidingView, Keyboard } from 'react-native';

import { AppScreens } from '@common/constants';

import { Navigator } from '@common/helpers/navigator';
import Vault from '@common/libs/vault';

import { AccountSchema } from '@store/schemas/latest';

import { PasswordInput, Header, Footer, Button, Spacer } from '@components/General';

import Localize from '@locale';

// style
import { AppStyles } from '@theme';
import styles from './styles';

/* types ==================================================================== */
export interface Props {
    account: AccountSchema;
}

export interface State {
    currentPassphrase: string;
    passphrase: {
        value: string;
        isValid: boolean;
    };
    passphrase_confirmation: string;
}

/* Component ==================================================================== */
class ChangePassphraseView extends Component<Props, State> {
    static screenName = AppScreens.Account.Edit.ChangePassphrase;

    static options() {
        return {
            bottomTabs: { visible: false },
        };
    }

    constructor(props: Props) {
        super(props);

        this.state = {
            currentPassphrase: '',
            passphrase: {
                value: '',
                isValid: false,
            },
            passphrase_confirmation: '',
        };
    }

    savePassphrase = async () => {
        const { account } = this.props;
        const { currentPassphrase, passphrase, passphrase_confirmation } = this.state;

        if (!currentPassphrase) {
            Alert.alert(Localize.t('global.error'), Localize.t('account.currentPassphraseShouldNotBeEmpty'));
            return;
        }

        if (!passphrase.isValid) {
            Alert.alert(Localize.t('global.error'), Localize.t('account.enterValidPassphrase'));
            return;
        }

        if (passphrase.value !== passphrase_confirmation) {
            Alert.alert(Localize.t('global.error'), Localize.t('account.passphraseConfirmNotMatch'));
            return;
        }

        // try to open vault with given passphrase
        const privateKey = await Vault.open(account.publicKey, currentPassphrase);

        if (!privateKey) {
            Alert.alert(Localize.t('global.error'), Localize.t('account.enteredCurrentPassphraseIsInvalid'));
            return;
        }

        // reKey the account with new passphrase
        await Vault.reKey(account.publicKey, currentPassphrase, passphrase.value);

        Navigator.pop();

        Alert.alert(Localize.t('global.success'), Localize.t('account.yourAccountPassphraseChangedSuccessfully'));
    };

    // dismiss the keyboard when click outside
    shouldSetResponse = () => true;
    onRelease = () => Keyboard.dismiss();

    render() {
        const { passphrase } = this.state;

        return (
            <View
                onResponderRelease={this.onRelease}
                onStartShouldSetResponder={this.shouldSetResponse}
                testID="account-change-passphrase-view"
                style={[styles.container]}
            >
                <Header
                    leftComponent={{
                        icon: 'IconChevronLeft',
                        onPress: () => {
                            Navigator.pop();
                        },
                    }}
                    centerComponent={{ text: Localize.t('account.changePassphrase') }}
                />
                <KeyboardAvoidingView
                    enabled={Platform.OS === 'ios'}
                    behavior="padding"
                    style={[AppStyles.flex1, AppStyles.paddingSml]}
                >
                    <PasswordInput
                        placeholder={Localize.t('account.currentPassphrase')}
                        selectTextOnFocus={passphrase.isValid}
                        onChange={(currentPassphrase) => this.setState({ currentPassphrase })}
                        validate={false}
                    />

                    <Spacer />
                    <PasswordInput
                        editable
                        placeholder={Localize.t('account.newPassphrase')}
                        minLength={8}
                        onChange={(value: string, isValid: boolean) => {
                            this.setState({ passphrase: { value, isValid } });
                        }}
                        validate
                        autoFocus={false}
                    />

                    <PasswordInput
                        editable={passphrase.isValid}
                        placeholder={Localize.t('account.repeatPassphrase')}
                        selectTextOnFocus={passphrase.isValid}
                        onChange={(passphrase_confirmation) => this.setState({ passphrase_confirmation })}
                        validate={false}
                    />
                </KeyboardAvoidingView>

                <Footer safeArea>
                    <Button
                        label={Localize.t('global.save')}
                        onPress={() => {
                            this.savePassphrase();
                        }}
                    />
                </Footer>
            </View>
        );
    }
}

/* Export Component ==================================================================== */
export default ChangePassphraseView;
